import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import { confirmationRequired, STREAM_FIXTURES } from "./lib/fixtures";
import {
  ApiError,
  StreamUnavailableError,
  type SearchApi,
  type SearchResponse,
  type StreamEvent,
} from "./lib/types";
import { useConfirmSubmit } from "./lib/useConfirmSubmit";
import { renderApp, searchPath, testApi } from "./test/renderApp";
import { answered } from "./lib/fixtures";

/*
 * 기준 확인 화면. 최초 검색 응답이 곧 확인 대기이고, 답은 POST /v1/search/confirm 으로 간다.
 * API 는 합성 mock(createMockApi)이다 — 실서버·실DB·실LLM 을 확인한 것이 아니고, jsdom 이라 레이아웃·실제 IME 도 아니다.
 */

const QUESTION = "안전한 국내 ETF 5개 보여줘";
const RESUMED = "navigation";
const RESUMED_NAME = "이어서 물어볼 질문";

/**
 * overrides 가 함수면 같은 mock 인스턴스(base)를 받는다. 세션은 그 인스턴스가 기억하므로, 제출을 감싸
 * 지연·실패를 흉내 낼 때는 base.confirm 으로 위임해야 세션을 찾는다.
 */
function setup(
  overrides:
    | Partial<SearchApi>
    | ((base: SearchApi) => Partial<SearchApi>) = {},
  strict = false,
) {
  const base = testApi();
  const api: SearchApi = {
    ...base,
    ...(typeof overrides === "function" ? overrides(base) : overrides),
  };
  const rendered = renderApp({ api, strict, path: searchPath(QUESTION) });
  return { ...rendered, api };
}

async function answerWith(
  user: ReturnType<typeof setup>["user"],
  text: string,
) {
  await user.type(await screen.findByLabelText("답변 입력"), text);
  await user.click(screen.getByRole("button", { name: "답변 보내기" }));
}

/** confirm 호출의 첫 인자(요청)를 모은다. */
const requestsOf = (api: SearchApi) =>
  vi.mocked(api.confirm).mock.calls.map((call) => call[0]);

describe("확인 대기 진입", () => {
  test("최초 검색 한 번이 곧 확인 대기이고, 대기 중에는 추가 검색·설명·제출이 0회다", async () => {
    const { api } = setup();
    expect(
      await screen.findByText("안전하다는 기준은 어떤 뜻인가요?"),
    ).toBeVisible();
    expect(screen.getByText(QUESTION)).toBeVisible();
    expect(screen.getByText("국내 ETF · 5개")).toBeVisible();
    // 별도 확인 시작 호출이 없으므로 같은 질문의 해석 요청은 스트림 한 번뿐이다.
    expect(api.searchStream).toHaveBeenCalledTimes(1);
    expect(api.search).not.toHaveBeenCalled();
    expect(api.explain).not.toHaveBeenCalled();
    expect(api.confirm).not.toHaveBeenCalled();
    // 결과·답변이 없는 상태를 검색 성공으로 그리지 않는다.
    expect(screen.queryByRole(RESUMED, { name: RESUMED_NAME })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /이 기준으로 계속/ }),
    ).toBeNull();
  });

  test("스트림이 확인 대기로 끝나도 자동 재검색을 발사하지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { api } = setup();
      await screen.findByText("안전하다는 기준은 어떤 뜻인가요?");
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.searchStream).toHaveBeenCalledTimes(1);
      expect(api.search).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("명확한 질문은 확인 없이 기존 검색으로 진행한다", async () => {
    const api = testApi();
    renderApp({ api, path: searchPath("순자산 큰 국내 ETF 5개") });
    await screen.findByRole(RESUMED, { name: RESUMED_NAME });
    expect(api.searchStream).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("기준을 한 번 확인할게요")).toBeNull();
  });

  test("JSON 검색 대체 경로의 확인 대기도 같은 화면이 된다", async () => {
    const mock = testApi();
    const api = testApi({
      searchStream: () =>
        // eslint-disable-next-line require-yield
        (async function* () {
          throw new StreamUnavailableError();
        })(),
      search: vi.fn(mock.search),
    });
    renderApp({ api, path: searchPath(QUESTION) });
    expect(
      await screen.findByText("안전하다는 기준은 어떤 뜻인가요?"),
    ).toBeVisible();
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(api.confirm).not.toHaveBeenCalled();
  });

  test("새로 검색(다시 확인)하면 새 실행 키를 쓴다", async () => {
    const { user, api } = setup({
      confirm: vi.fn().mockRejectedValue(new ApiError(410, "session_expired")),
    });
    await answerWith(user, "답");
    await screen.findByText("확인 시간이 지났습니다");
    const firstKey = vi.mocked(api.searchStream).mock.calls[0][2];

    await user.click(screen.getByRole("button", { name: "새 검색으로 시작" }));
    await screen.findByText("안전하다는 기준은 어떤 뜻인가요?");
    const keys = vi.mocked(api.searchStream).mock.calls.map((c) => c[2]);
    expect(keys).toHaveLength(2);
    expect(typeof firstKey).toBe("string");
    expect(keys[1]).not.toBe(firstKey);
  });
});

describe("답변 제출", () => {
  test("답을 한 번 제출하고, 이어받은 결과에 요약·후속 질문·개념 설명이 같은 실행으로 붙는다", async () => {
    const { user, api } = setup();
    await answerWith(user, "변동성이 낮은 것");

    expect(
      await screen.findByRole(RESUMED, { name: RESUMED_NAME }),
    ).toBeVisible();
    const [sent] = requestsOf(api);
    expect(requestsOf(api)).toHaveLength(1);
    expect(sent).toMatchObject({
      sessionId: expect.any(String),
      version: 1,
      action: "answer_text",
      answer: "변동성이 낮은 것",
    });
    // 답을 원 질문에 붙인 새 검색을 하지 않는다.
    expect(api.searchStream).toHaveBeenCalledTimes(1);
    expect(api.search).not.toHaveBeenCalled();
    // 개념 설명은 검색 실행당 한 번이다.
    await waitFor(() => expect(api.explain).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.explain).toHaveBeenCalledTimes(1);
  });

  test("제출 중 버튼 연타와 Enter 반복에도 제출은 한 번이다", async () => {
    let finish: () => void = () => {};
    const { user, api } = setup((base) => ({
      confirm: vi.fn(
        (request) =>
          new Promise<SearchResponse>((resolve) => {
            finish = () => resolve(base.confirm(request));
          }),
      ),
    }));
    const input = await screen.findByLabelText("답변 입력");
    await user.type(input, "낮은 변동성");
    await user.dblClick(screen.getByRole("button", { name: "답변 보내기" }));
    await user.type(input, "{Enter}{Enter}");
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "보내는 중" })).toBeDisabled();
    expect(input).toBeDisabled();
    finish();
    await screen.findByRole(RESUMED, { name: RESUMED_NAME });
  });

  test("한글 조합 중 Enter는 제출하지 않고, 조합이 끝난 Enter만 제출한다", async () => {
    const { user, api } = setup();
    const input = await screen.findByLabelText("답변 입력");
    await user.type(input, "낮은 변동성");

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(api.confirm).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByRole(RESUMED, { name: RESUMED_NAME });
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });

  test("공백뿐인 답과 상한을 넘는 답은 보내지 않는다", async () => {
    const { user, api } = setup();
    const input = await screen.findByLabelText("답변 입력");
    const send = screen.getByRole("button", { name: "답변 보내기" });
    await user.type(input, "   ");
    expect(send).toBeDisabled();
    await user.clear(input);
    // mock 의 answer_max_length 는 100. 코드 포인트로 센다.
    fireEvent.change(input, { target: { value: "가".repeat(101) } });
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: "가".repeat(100) } });
    expect(send).toBeEnabled();
    expect(api.confirm).not.toHaveBeenCalled();
  });

  test("이어받은 응답의 질문이 원 질문과 다르면 결과로 그리지 않고 종료한다", async () => {
    const { user } = setup({
      confirm: vi.fn().mockResolvedValue({
        ...answered,
        question: `${QUESTION} 낮은 변동성`,
      }),
    });
    await answerWith(user, "낮은 변동성");
    expect(await screen.findByText("답변을 처리하지 못했습니다")).toBeVisible();
    expect(screen.queryByRole(RESUMED, { name: RESUMED_NAME })).toBeNull();
    expect(screen.queryByRole("button", { name: /다시 보내기/ })).toBeNull();
  });
});

describe("제출 실패", () => {
  test("전송 불명은 처음 요청을 같은 키·같은 본문으로만 다시 보내고, 답을 바꿀 수 없다", async () => {
    const { user, api } = setup();
    await answerWith(user, "전송실패");

    expect(await screen.findByText(/확인하지 못했습니다/)).toBeVisible();
    expect(requestsOf(api)).toHaveLength(1);
    // 보낸 답을 읽기 전용으로 보여 주고, 취소됐다고 말하지 않는다.
    const input = screen.getByLabelText("답변 입력");
    expect(input).toHaveValue("전송실패");
    expect(input).toHaveAttribute("readonly");
    expect(screen.getByText(/성공을 보장하지 않습니다/)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "같은 요청으로 확인" }),
    );
    await screen.findByRole(RESUMED, { name: RESUMED_NAME });
    const [first, second] = requestsOf(api);
    expect(requestsOf(api)).toHaveLength(2);
    expect(second).toEqual(first);
  });

  test("409 turn_in_progress 는 충돌과 달리 처리 중 안내와 수동 동일 키 재전송만 연다", async () => {
    const confirm = vi.fn();
    const { user } = setup((base) => {
      confirm
        .mockRejectedValueOnce(new ApiError(409, "turn_in_progress", 0))
        .mockImplementation((request) => base.confirm(request));
      return { confirm };
    });
    await answerWith(user, "답");

    expect(
      await screen.findByText(/기존 요청을 처리하고 있습니다/),
    ).toBeVisible();
    // 자동으로 다시 보내지 않는다.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confirm).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "같은 요청으로 확인" }),
    );
    await screen.findByRole(RESUMED, { name: RESUMED_NAME });
    expect(confirm.mock.calls[1][0]).toEqual(confirm.mock.calls[0][0]);
  });

  test.each([
    ["충돌", new ApiError(409, "session_conflict"), "확인 내용이 바뀌었습니다"],
    ["만료", new ApiError(410, "session_expired"), "확인 시간이 지났습니다"],
    [
      "미지원",
      new ApiError(501, "confirm_unsupported"),
      "기준 확인을 지원하지 않습니다",
    ],
    [
      "응답 형식 오류",
      new ApiError(200, "invalid_response"),
      "답변을 처리하지 못했습니다",
    ],
  ])(
    "%s 는 종료 안내이고 같은 요청 재전송을 열지 않는다",
    async (_, error, title) => {
      const { user, api } = setup({
        confirm: vi.fn().mockRejectedValue(error),
      });
      await answerWith(user, "답");
      expect(await screen.findByText(title)).toBeVisible();
      expect(screen.queryByRole("button", { name: /다시 보내기/ })).toBeNull();
      expect(api.confirm).toHaveBeenCalledTimes(1);
      if (error.code === "confirm_unsupported")
        expect(
          screen.queryByRole("button", { name: "새 검색으로 시작" }),
        ).toBeNull();
    },
  );

  test("일반 5xx 는 처리 여부 불명으로 두고 자동 새 키 재전송을 하지 않는다", async () => {
    const { user, api } = setup({
      confirm: vi.fn().mockRejectedValue(new ApiError(503, "unavailable")),
    });
    await answerWith(user, "답");
    expect(
      await screen.findByRole("button", { name: "같은 요청으로 확인" }),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });
});

describe("실행 전환과 잠금", () => {
  test("확인 중 질문을 바꾸면 늦게 온 이전 확인 대기가 새 질문을 가리지 않는다", async () => {
    let release: () => void = () => {};
    const mock = testApi();
    const api = testApi({
      searchStream: vi.fn((question, signal, runKey) => {
        if (question !== QUESTION)
          return mock.searchStream(question, signal, runKey);
        return (async function* () {
          await new Promise<void>((resolve) => (release = resolve));
          yield* STREAM_FIXTURES.confirmation as unknown as StreamEvent[];
        })();
      }),
    });
    const { user } = renderApp({ api, path: searchPath(QUESTION) });
    const box = await screen.findByRole("textbox", { name: "질문" });
    await user.clear(box);
    await user.type(box, "순자산 큰 국내 ETF 5개{Enter}");
    await screen.findByRole(RESUMED, { name: RESUMED_NAME });

    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByText("기준을 한 번 확인할게요")).toBeNull();
  });

  test("제출 중 질문을 바꾸면 늦게 온 제출 응답을 버린다", async () => {
    let finish: () => void = () => {};
    const { user } = setup((base) => ({
      confirm: vi.fn(
        (request) =>
          new Promise<SearchResponse>((resolve) => {
            finish = () => resolve(base.confirm(request));
          }),
      ),
    }));
    await answerWith(user, "답");
    const box = await screen.findByRole("textbox", { name: "질문" });
    await user.clear(box);
    await user.type(box, "순자산 큰 국내 ETF 5개{Enter}");
    await screen.findByRole(RESUMED, { name: RESUMED_NAME });

    finish();
    await new Promise((resolve) => setTimeout(resolve, 30));
    // 늦게 온 이전 질문의 결과가 새 결과 옆에 더해지지 않는다(후속 질문 영역이 하나뿐이다).
    expect(screen.getAllByRole(RESUMED, { name: RESUMED_NAME })).toHaveLength(
      1,
    );
    expect(
      screen.getByRole("heading", { name: /순자산 큰 국내 ETF 5개/ }),
    ).toBeInTheDocument();
  });

  test("오래된 요청의 finally 가 새 제출의 잠금을 풀지 않는다", async () => {
    const pending: Array<(value: SearchResponse) => void> = [];
    const confirm = vi.fn(
      () =>
        new Promise<SearchResponse>((resolve) => {
          pending.push(resolve);
        }),
    );
    const api = { confirm } as unknown as SearchApi;
    const { result, rerender } = renderHook(
      ({ runId }) => useConfirmSubmit(runId, confirmationRequired, api),
      { initialProps: { runId: 1 } },
    );

    act(() => result.current.submit("첫 번째"));
    expect(confirm).toHaveBeenCalledTimes(1);

    // 실행이 바뀌면 첫 요청은 abort 되고, 새 실행에서 새 제출이 시작된다.
    rerender({ runId: 2 });
    // 새 제출 전에 잡아 둔 핸들러(이벤트 반복·연타가 쥐고 있는 오래된 클로저)는 아직 awaiting 으로 보인다.
    const staleSubmit = result.current.submit;
    act(() => result.current.submit("두 번째"));
    expect(confirm).toHaveBeenCalledTimes(2);

    // 첫 요청이 뒤늦게 끝나(finally 실행) 도 두 번째 요청의 잠금은 그대로여야 한다.
    await act(async () => {
      pending[0]({
        ...answered,
        question: confirmationRequired.original_question,
      });
    });
    act(() => staleSubmit("세 번째"));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(result.current.state.phase).toBe("submitting");
  });
});

describe("비밀 값 보관", () => {
  test("StrictMode에서도 제출은 한 번이고 세션·답은 저장소·URL·콘솔에 남지 않는다", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    try {
      const { user, api } = setup({}, true);
      await answerWith(user, "비밀답변");
      await screen.findByRole(RESUMED, { name: RESUMED_NAME });

      expect(api.confirm).toHaveBeenCalledTimes(1);
      const secret = requestsOf(api)[0].secret;
      const visible = JSON.stringify([
        { ...localStorage },
        { ...sessionStorage },
        screen.getByTestId("location").textContent,
        spies.flatMap((spy) => spy.mock.calls),
      ]);
      expect(visible).not.toContain("비밀답변");
      expect(visible).not.toContain(secret);
      expect(visible).not.toContain("mock-session");
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  test("새로고침하면 처음부터 다시 시작한다는 안내를 보여 준다", async () => {
    setup();
    expect(
      await screen.findByText(/새로고침하거나 다시 검색하면 새로/),
    ).toBeVisible();
  });
});
