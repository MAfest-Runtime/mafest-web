import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { answered } from "./lib/fixtures";
import { ApiError, type SearchApi } from "./lib/types";
import { renderApp, searchPath, testApi } from "./test/renderApp";

/*
 * 최초 검색과 확인 제출의 409 세 가지(turn_in_progress / session_conflict / turn_indeterminate).
 * API 는 합성 mock 이다 — 실서버·실브라우저 확인이 아니다. 시간은 가짜 타이머로 흘린다.
 */

const QUESTION = "순자산 큰 국내 ETF 5개";
const RESEND = { name: "같은 요청 다시 보내기" };

function inProgress(retryAfter: number | null) {
  return new ApiError(409, "turn_in_progress", retryAfter, "r-409");
}

/** search/searchStream 호출이 받은 Idempotency-Key 들. */
const keysOf = (fn: SearchApi["search"] | SearchApi["searchStream"]) =>
  vi.mocked(fn as SearchApi["search"]).mock.calls.map((call) => call[2]);

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => vi.useRealTimers());

describe("최초 검색의 409", () => {
  test("HTTP turn_in_progress: 대기 동안 재전송은 잠기고, 누르면 같은 질문·같은 키로 한 번 더 보낸다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const search = vi
      .fn<SearchApi["search"]>()
      .mockRejectedValueOnce(inProgress(3))
      .mockResolvedValue(answered);
    const api = testApi({ search });
    renderApp({ api, path: searchPath(QUESTION) });

    expect(
      await screen.findByText("기존 요청을 처리하고 있습니다"),
    ).toBeVisible();
    const button = screen.getByRole("button", RESEND);
    expect(button).toBeDisabled();

    await advance(2000);
    // 기다리는 동안에도 자동으로 다시 보내지 않는다.
    expect(search).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await advance(1500);
    expect(search).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
    await act(async () => button.click());

    await screen.findByRole("navigation", { name: "이어서 물어볼 질문" });
    const [first, second] = vi.mocked(search).mock.calls;
    expect(second[0]).toBe(first[0]);
    expect(first[2]).toBeTruthy();
    expect(second[2]).toBe(first[2]);
  });

  test("열린 SSE 의 처리 중 오류: 고정 2초 뒤에만 활성화되고 같은 키로 다시 보낸다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mock = testApi();
    const searchStream = vi
      .fn<SearchApi["searchStream"]>()
      .mockImplementationOnce(() =>
        // 열린 뒤의 error 이벤트는 헤더가 없어 api.ts 가 retryAfter 2 로 채운다.
        ({
          [Symbol.asyncIterator]: () => ({
            next: () => Promise.reject(inProgress(2)),
          }),
        }),
      )
      .mockImplementation((q, signal, key) =>
        mock.searchStream(q, signal, key),
      );
    const api = testApi({ searchStream });
    renderApp({ api, path: searchPath(QUESTION) });

    await screen.findByText("기존 요청을 처리하고 있습니다");
    const button = screen.getByRole("button", RESEND);
    expect(button).toBeDisabled();
    await advance(1000);
    expect(button).toBeDisabled();
    await advance(1200);
    expect(button).toBeEnabled();
    expect(searchStream).toHaveBeenCalledTimes(1);

    await act(async () => button.click());
    await screen.findByRole("navigation", { name: "이어서 물어볼 질문" });
    const keys = keysOf(searchStream);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  test.each([
    ["turn_indeterminate", "이 요청은 이어갈 수 없습니다"],
    ["session_conflict", "요청이 충돌했습니다"],
  ])(
    "%s: 재전송 없이 종료하고, 새 검색은 새 키를 쓴다",
    async (code, title) => {
      const search = vi
        .fn<SearchApi["search"]>()
        .mockRejectedValueOnce(new ApiError(409, code, null, "r-409"))
        .mockResolvedValue(answered);
      const { user } = renderApp({
        api: testApi({ search }),
        path: searchPath(QUESTION),
      });

      expect(await screen.findByText(title)).toBeVisible();
      expect(screen.queryByRole("button", RESEND)).toBeNull();

      await user.click(
        screen.getByRole("button", { name: "새 검색으로 시작" }),
      );
      await screen.findByRole("navigation", { name: "이어서 물어볼 질문" });
      const keys = keysOf(search);
      expect(keys).toHaveLength(2);
      expect(keys[1]).not.toBe(keys[0]);
    },
  );

  test("질문을 바꾸면 이전 질문의 늦은 409 와 대기 타이머가 새 화면을 바꾸지 못한다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let rejectFirst: (error: ApiError) => void = () => {};
    const mock = testApi();
    const search = vi.fn<SearchApi["search"]>((question, signal, key) =>
      question === QUESTION
        ? new Promise((_, reject) => (rejectFirst = reject))
        : mock.search(question, signal, key),
    );
    const api = testApi({ search });
    const { user } = renderApp({ api, path: searchPath(QUESTION) });

    const box = await screen.findByRole("textbox", { name: "질문" });
    await user.clear(box);
    await user.type(box, "총보수 낮은 국내 ETF 5개{Enter}");
    await screen.findByRole("navigation", { name: "이어서 물어볼 질문" });

    await act(async () => rejectFirst(inProgress(1)));
    await advance(3000);
    expect(screen.queryByText("기존 요청을 처리하고 있습니다")).toBeNull();
    expect(screen.queryByRole("button", RESEND)).toBeNull();
  });
});

describe("확인 답변 제출의 409", () => {
  const CONFIRM_QUESTION = "안전한 국내 ETF 5개 보여줘";

  async function submitAnswer(
    user: ReturnType<typeof renderApp>["user"],
    text: string,
  ) {
    await user.type(await screen.findByLabelText("답변 입력"), text);
    await user.click(screen.getByRole("button", { name: "답변 보내기" }));
  }

  test("turn_indeterminate: 입력창과 같은 요청 재전송이 사라지고 새 검색만 남는다", async () => {
    const base = testApi();
    const confirm = vi
      .fn<SearchApi["confirm"]>()
      .mockRejectedValue(new ApiError(409, "turn_indeterminate", null, "r-9"));
    const { user } = renderApp({
      api: { ...base, confirm },
      path: searchPath(CONFIRM_QUESTION),
    });

    await submitAnswer(user, "하락장에서 덜 빠지는 것");
    expect(
      await screen.findByText("이 요청은 이어갈 수 없습니다"),
    ).toBeVisible();
    expect(screen.queryByLabelText("답변 입력")).toBeNull();
    expect(screen.queryByRole("button", RESEND)).toBeNull();
    expect(
      screen.getByRole("button", { name: "처음부터 다시 확인" }),
    ).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  test("turn_in_progress 뒤 재전송은 첫 요청의 키·세션·버전·동작·답을 그대로 보낸다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const base = testApi();
    const confirm = vi
      .fn<SearchApi["confirm"]>()
      .mockRejectedValueOnce(inProgress(1))
      .mockImplementation((request, signal) => base.confirm(request, signal));
    const { user } = renderApp({
      api: { ...base, confirm },
      path: searchPath(CONFIRM_QUESTION),
    });

    await submitAnswer(user, "하락장에서 덜 빠지는 것");
    await screen.findByText(/서버가 아직 처리하고 있습니다/);
    const button = screen.getByRole("button", RESEND);
    expect(button).toBeDisabled();
    await advance(1500);
    expect(confirm).toHaveBeenCalledTimes(1);
    await act(async () => button.click());
    await screen.findByRole("navigation", { name: "이어서 물어볼 질문" });

    const [first, second] = confirm.mock.calls.map((call) => call[0]);
    expect(second).toEqual(first);
  });
});
