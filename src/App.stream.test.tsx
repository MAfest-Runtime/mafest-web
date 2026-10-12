import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  answered,
  caveat,
  fallback,
  notCollected,
  OUTCOME_FIXTURES,
  STREAM_FIXTURES,
} from "./lib/fixtures";
import { RETRY_DELAY_MS } from "./lib/searchStream";
import {
  ApiError,
  StreamCutError,
  type SearchApi,
  type SearchResponse,
  type StreamEvent,
} from "./lib/types";
import {
  currentLocation,
  renderApp,
  resetViewport,
  searchPath,
  setViewport,
  testApi,
} from "./test/renderApp";

/*
 * 스트림 화면 테스트. 이벤트를 하나씩 밀어 넣으며 화면이 D40-8 순서로 바뀌는지, 끊김 재시도와 취소가
 * 어떻게 보이는지 본다. 서버는 쓰지 않는다.
 */

const normal = STREAM_FIXTURES.answered as unknown as StreamEvent[];
const [
  start,
  interpretation,
  results,
  delta0,
  delta1,
  answerDone,
  suggestions,
  done,
] = normal;

afterEach(() => {
  resetViewport();
  vi.useRealTimers();
});

/** 테스트가 이벤트를 하나씩 밀어 넣는 스트림. 반복이 닫히면 signal 상태를 남긴다. */
function controlledStream() {
  const queue: Array<StreamEvent | Error | "end"> = [];
  let wake: (() => void) | null = null;
  const state = { signal: undefined as AbortSignal | undefined, started: 0 };
  const push = (item: StreamEvent | Error | "end") => {
    queue.push(item);
    wake?.();
  };
  async function* gen(
    _question: string,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent, void, undefined> {
    state.signal = signal;
    state.started += 1;
    for (;;) {
      while (queue.length === 0)
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      const item = queue.shift()!;
      if (item === "end") return;
      if (item instanceof Error) throw item;
      yield item;
    }
  }
  return { gen, push, state };
}

async function feed(push: (e: StreamEvent) => void, ...events: StreamEvent[]) {
  for (const event of events) {
    await act(async () => {
      push(event);
    });
  }
}

function apiWith(searchStream: SearchApi["searchStream"]): SearchApi {
  return testApi({ searchStream: vi.fn(searchStream) });
}

describe("stream display order", () => {
  test("draws interpretation, table, sentences, final answer, chips and then confirms with done", async () => {
    setViewport(1280);
    const stream = controlledStream();
    renderApp({
      api: apiWith(stream.gen),
      path: searchPath(answered.question),
    });

    // 1. interpretation: 해석 카드만 있고 표와 답변은 아직 없다.
    await feed(stream.push, start, interpretation);
    expect(
      await screen.findByRole("region", { name: "질문 해석" }),
    ).toBeVisible();
    expect(screen.queryByRole("region", { name: "답변" })).toBeNull();
    expect(screen.getByText("조회하고 있습니다.")).toBeVisible();

    // 2. results: 표와 그래프가 나오고 답변 자리가 잡힌다. 인용 표시는 아직 없다.
    await feed(stream.push, results);
    expect(
      (await screen.findAllByText("SAMPLE 코스피200")).length,
    ).toBeGreaterThan(0);
    const answer = screen.getByRole("region", { name: "답변" });
    expect(
      within(answer).getByText("답변 문장을 만들고 있습니다."),
    ).toBeVisible();
    expect(screen.queryAllByText("답변에 인용,")).toHaveLength(0);

    // 3. answer_delta: 문장이 하나씩 덧붙는다. 덧붙는 영역은 polite live region 이다.
    await feed(stream.push, delta0);
    const live = answer.querySelector("[aria-live='polite']")!;
    expect(live).toHaveAttribute("aria-atomic", "false");
    expect(live).toHaveTextContent(/^순자산이 가장 큰 국내 ETF는/);
    expect(live).not.toHaveTextContent("그다음은");
    await feed(stream.push, delta1);
    expect(live).toHaveTextContent(/그다음은 DEMO 미국S&P500/);
    expect(live.querySelectorAll(".answer__sentence")).toHaveLength(2);

    // 4. answer_done: 최종 답으로 덮고 live region 을 끈다.
    await feed(stream.push, answerDone);
    expect(answer.querySelector("[aria-live]")).toBeNull();
    expect(screen.queryByRole("link", { name: /총보수 순위로/ })).toBeNull();

    // 5. suggestions: 칩.
    await feed(stream.push, suggestions);
    expect(screen.getByRole("link", { name: /총보수 순위로/ })).toBeVisible();
    expect(screen.queryAllByText("답변에 인용,")).toHaveLength(0);

    // 6. done: 완성 응답으로 확정한다. 인용(cited)과 답변↔표 연결이 생긴다.
    await feed(stream.push, done);
    await act(async () => {
      stream.push("end");
    });
    expect((await screen.findAllByText("답변에 인용,")).length).toBe(3);
    expect(document.querySelectorAll(".cite-link").length).toBeGreaterThan(0);
  });

  test("keeps the same view instance from streaming to done (no remount)", async () => {
    setViewport(1280);
    const stream = controlledStream();
    renderApp({
      api: apiWith(stream.gen),
      path: searchPath(answered.question),
    });
    await feed(stream.push, start, interpretation, results);
    const table = await screen.findByRole("table");
    const region = table.closest("section");
    await feed(stream.push, delta0, delta1, answerDone, suggestions, done);
    await act(async () => {
      stream.push("end");
    });
    await screen.findAllByText("답변에 인용,");
    expect(screen.getByRole("table").closest("section")).toBe(region);
  });

  test("the answer area has no live region once the final answer is shown", async () => {
    setViewport(1280);
    const stream = controlledStream();
    renderApp({
      api: apiWith(stream.gen),
      path: searchPath(answered.question),
    });
    await feed(stream.push, ...normal);
    await act(async () => {
      stream.push("end");
    });
    const answer = await screen.findByRole("region", { name: "답변" });
    expect(answer.querySelector("[aria-live]")).toBeNull();
    expect(answer.querySelector("[aria-busy]")).toBeNull();
  });
});

describe("stream outcomes on the default mock", () => {
  test("대체 답변을 받으면 내부 배너 없이 최종 답변과 표를 유지", async () => {
    setViewport(1280);
    renderApp({ path: searchPath("모델 없이 순위 보여줘") });
    expect(await screen.findByText(fallback.answer.text)).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.queryByText(/답변 생성 모델이 꺼져 있어/)).toBeNull();
    expect(screen.queryByText("조회 결과만")).toBeNull();
    expect(screen.queryByRole("region", { name: "어떻게 답했나" })).toBeNull();
  });

  test("answer_done과 done 뒤에도 대체 답변의 내부 상태가 나타나지 않음", async () => {
    setViewport(1280);
    const stream = controlledStream();
    renderApp({
      api: apiWith(stream.gen),
      path: searchPath(answered.question),
    });
    await feed(stream.push, start, interpretation, results, delta0);
    const table = screen.getByRole("table");
    const response: SearchResponse = {
      ...answered,
      answer: {
        ...answered.answer,
        text: fallback.answer.text,
        generated_by: "fallback",
      },
    };
    const assertDisplay = () => {
      expect(screen.getByText(fallback.answer.text)).toBeVisible();
      expect(screen.getByRole("table")).toBe(table);
      expect(screen.queryByText(/답변 생성 모델이 꺼져 있어/)).toBeNull();
      expect(screen.queryByText("조회 결과만")).toBeNull();
      expect(screen.queryByText("AI 생성 문장")).toBeNull();
      expect(
        screen.queryByRole("region", { name: "어떻게 답했나" }),
      ).toBeNull();
    };
    await feed(stream.push, {
      event: "answer_done",
      data: { answer: response.answer },
    });
    assertDisplay();
    await feed(stream.push, suggestions, { event: "done", data: { response } });
    assertDisplay();
    await act(async () => {
      stream.push("end");
    });
  });

  test("overall deadline: an error event after results shows the timeout screen", async () => {
    renderApp({ path: searchPath("전체 시한 초과 질문") });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "시간이 초과됐습니다",
    );
  });

  test("an error event of internal kind shows the server error screen", async () => {
    const stream = controlledStream();
    renderApp({ api: apiWith(stream.gen), path: searchPath("q") });
    await feed(stream.push, start, interpretation);
    await act(async () => {
      stream.push(new ApiError(500, "internal", null, "r-500"));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "서버 오류가 났습니다",
    );
  });
});

describe("retry after a cut", () => {
  function cutThenOk() {
    let calls = 0;
    const api = apiWith(async function* () {
      calls += 1;
      if (calls === 1) {
        yield* [start, interpretation, results, delta0];
        throw new StreamCutError();
      }
      yield* normal;
    });
    return { api, calls: () => calls };
  }

  test("retries once after one second, clears the cut sentence and ends with a clean answer", async () => {
    vi.useFakeTimers();
    setViewport(1280);
    const { api, calls } = cutThenOk();
    renderApp({ api, path: searchPath(answered.question) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    // 끊긴 직후: 안내가 있고, 잘린 문장은 비었고, 표는 그대로다.
    expect(
      screen.getByText(/연결이 끊겨 다시 시도하고 있습니다/),
    ).toBeVisible();
    expect(calls()).toBe(1);
    expect(screen.queryByText(/^순자산이 가장 큰 국내 ETF는/)).toBeNull();
    expect(screen.getByRole("table")).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    });
    expect(calls()).toBe(2);
    expect(screen.queryByText(/연결이 끊겨 다시 시도하고 있습니다/)).toBeNull();
    // 새 답이 한 번만 보인다(앞 시도의 문장이 섞여 중복되지 않는다).
    const answer = screen.getByRole("region", { name: "답변" });
    expect(
      answer.textContent!.match(/순자산이 가장 큰 국내 ETF는/g),
    ).toHaveLength(1);
  });

  test("shows the connection failure screen when the retry is cut as well, with no third request", async () => {
    vi.useFakeTimers();
    const searchStream = vi.fn(async function* () {
      yield* [start, interpretation];
      throw new StreamCutError();
    });
    renderApp({ api: testApi({ searchStream }), path: searchPath("q") });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 5);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "서버에 연결할 수 없습니다",
    );
    expect(searchStream).toHaveBeenCalledTimes(2);
  });

  test("does not retry when the stream ends with an error event", async () => {
    vi.useFakeTimers();
    const searchStream = vi.fn(async function* () {
      yield start;
      throw new ApiError(504, "timeout", null, "r-504");
    });
    renderApp({ api: testApi({ searchStream }), path: searchPath("q") });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 5);
    });
    expect(searchStream).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("시간이 초과됐습니다");
  });
});

describe("cancel", () => {
  test("a new question aborts the running stream", async () => {
    const stream = controlledStream();
    const { user } = renderApp({
      api: apiWith(stream.gen),
      path: searchPath("첫 질문"),
    });
    await feed(stream.push, start, interpretation);
    const signal = stream.state.signal!;
    expect(signal.aborted).toBe(false);
    const box = screen.getByLabelText("질문");
    await user.clear(box);
    await user.type(box, "두 번째 질문{Enter}");
    expect(signal.aborted).toBe(true);
    expect(currentLocation()).toContain("두 번째 질문");
  });

  test("a new question during the retry wait cancels the pending retry", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const searchStream = vi.fn(async function* (question: string) {
      calls += 1;
      if (question === "첫 질문") {
        yield start;
        throw new StreamCutError();
      }
      yield* normal;
    });
    renderApp({
      api: testApi({ searchStream }),
      path: searchPath("첫 질문"),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText(/연결이 끊겨 다시 시도/)).toBeVisible();
    // 가짜 타이머 아래에서는 user-event 의 입력 지연이 멈추므로 이벤트를 직접 보낸다.
    const box = screen.getByLabelText("질문");
    await act(async () => {
      fireEvent.change(box, { target: { value: "두 번째 질문" } });
      fireEvent.submit(box.closest("form")!);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 3);
    });
    // 첫 질문의 재시도는 일어나지 않았다: 첫 질문 1번 + 두 번째 질문 1번.
    expect(calls).toBe(2);
    expect(searchStream.mock.calls.map((c) => c[0])).toEqual([
      "첫 질문",
      "두 번째 질문",
    ]);
  });

  test("leaving the page aborts the stream", async () => {
    const stream = controlledStream();
    const { unmount } = renderApp({
      api: apiWith(stream.gen),
      path: searchPath("q"),
    });
    await feed(stream.push, start);
    const signal = stream.state.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe("suggestion chips on answered and caveat", () => {
  function withSuggestions(
    response: SearchResponse,
    suggestions: SearchResponse["suggestions"],
  ): SearchApi {
    return testApi({
      search: vi
        .fn()
        .mockResolvedValue({ ...structuredClone(response), suggestions }),
    });
  }

  const chips = [
    { label: "총보수 순위로", question: "총보수 낮은 국내 ETF 5개" },
    { label: "분배 많은 순", question: "분배율 높은 국내 ETF 5개" },
  ];

  test.each([
    ["answered", answered],
    ["caveat", caveat],
  ])(
    "%s draws chips below the answer and table, and a chip searches again",
    async (_, fixture) => {
      setViewport(1280);
      const { user } = renderApp({
        api: withSuggestions(fixture, chips),
        path: searchPath(fixture.question),
      });
      const chip = await screen.findByRole("link", { name: /총보수 순위로/ });
      expect(screen.getByRole("link", { name: /분배 많은 순/ })).toBeVisible();
      await user.click(chip);
      expect(currentLocation()).toContain("총보수 낮은 국내 ETF 5개");
    },
  );

  test.each([
    ["answered", answered],
    ["caveat", caveat],
  ])("%s without suggestions leaves no chip area", async (_, fixture) => {
    renderApp({
      api: withSuggestions(fixture, []),
      path: searchPath(fixture.question),
    });
    await screen.findByRole("region", { name: "답변" });
    expect(document.querySelector(".question-chips")).toBeNull();
  });
});

describe("r9 fixtures and unknown values", () => {
  test("not_collected explains that past history and trends are not collected", async () => {
    renderApp({
      api: testApi({
        search: vi.fn().mockResolvedValue(structuredClone(notCollected)),
      }),
      path: searchPath(notCollected.question),
    });
    expect(await screen.findByText(/없는 항목: 과거 추이/)).toBeVisible();
    expect(screen.queryByText(/거래량/)).toBeNull();
  });

  test("an unknown trace stage and a method=llm mapping do not break the screen", async () => {
    setViewport(1280);
    const response = structuredClone(answered);
    (response.trace!.steps[0] as { stage: string }).stage = "future_stage";
    (response.interpretation.mappings[0] as { method: string }).method = "llm";
    renderApp({
      api: testApi({ search: vi.fn().mockResolvedValue(response) }),
      path: searchPath(response.question),
    });
    expect(await screen.findByRole("region", { name: "답변" })).toBeVisible();
    expect(screen.getByText(/future_stage/)).toBeInTheDocument();
    expect(screen.queryByText(/AI가 읽음/)).toBeNull();
  });

  test("generate and suggest trace stages are labelled", async () => {
    setViewport(1280);
    const response = structuredClone(answered);
    response.trace!.steps.push(
      { stage: "generate", label: "생성", ms: 5, detail: null, query: null },
      { stage: "suggest", label: "후속", ms: 2, detail: null, query: null },
    );
    renderApp({
      api: testApi({ search: vi.fn().mockResolvedValue(response) }),
      path: searchPath(response.question),
    });
    await screen.findByRole("region", { name: "답변" });
    expect(screen.getAllByText("후속 질문").length).toBeGreaterThan(0);
  });
});

/*
 * 후속 질문 카드 진단. 받은 후보가 어느 단계에서 사라지는지 웹 쪽 경로를 하나씩 고정한다.
 * 후보가 비어 오면 웹은 아무것도 만들어 내지 않는다(API의 "후보 없음"과 웹의 "표시 오류"를 구분하기 위해서다).
 */
describe("suggestion chips along the stream path", () => {
  const streamChips = [
    { label: "총보수 순위로", question: "총보수 낮은 국내 ETF 5개" },
    { label: "분배 많은 순", question: "분배율 높은 국내 ETF 5개" },
  ];

  function eventsWith(
    streamed: SearchResponse["suggestions"],
    finalSuggestions: SearchResponse["suggestions"],
  ): StreamEvent[] {
    const finalResponse = {
      ...structuredClone(answered),
      suggestions: finalSuggestions,
    };
    return [
      start,
      interpretation,
      results,
      delta0,
      delta1,
      answerDone,
      { event: "suggestions", data: { suggestions: streamed } },
      { event: "done", data: { response: finalResponse } },
    ] as unknown as StreamEvent[];
  }

  function replay(events: StreamEvent[]): SearchApi {
    return apiWith(async function* () {
      yield* events;
    });
  }

  test("chips received on the stream remain after done when the final response carries the same chips, and a chip searches", async () => {
    setViewport(1280);
    const { user } = renderApp({
      api: replay(eventsWith(streamChips, streamChips)),
      path: searchPath(answered.question),
    });
    const chip = await screen.findByRole("link", { name: /총보수 순위로/ });
    await user.click(chip);
    expect(currentLocation()).toContain("총보수 낮은 국내 ETF 5개");
  });

  test("the final response is authoritative: chips streamed earlier disappear when done carries none", async () => {
    setViewport(1280);
    renderApp({
      api: replay(eventsWith(streamChips, [])),
      path: searchPath(answered.question),
    });
    await screen.findByRole("region", { name: "답변" });
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /총보수 순위로/ })).toBeNull(),
    );
    // 웹이 임의의 금융 질문을 만들어 채우지 않는다.
    expect(document.querySelector(".question-chips")).toBeNull();
  });

  test.each([
    ["no_result", "조건을 바꿔 보세요"],
    ["not_collected", "대신 물어볼 수 있는 질문"],
    ["unread", "다시 물어볼 질문"],
    ["refused", "대신 할 수 있는 질문"],
  ] as const)(
    "%s draws its own chip group when the response has candidates",
    async (outcome, title) => {
      const base = OUTCOME_FIXTURES[outcome];
      const response: SearchResponse = {
        ...structuredClone(base),
        suggestions: streamChips,
      };
      renderApp({
        api: testApi({ search: vi.fn().mockResolvedValue(response) }),
        path: searchPath(base.question),
      });
      const group = await screen.findByRole("navigation", { name: title });
      expect(within(group).getAllByRole("link")).toHaveLength(2);
    },
  );

  test("on a narrow screen the chips live in the result tab and come back after visiting another tab", async () => {
    setViewport(390);
    const { user } = renderApp({
      api: replay(eventsWith(streamChips, streamChips)),
      path: searchPath(answered.question),
    });
    await screen.findByRole("link", { name: /총보수 순위로/ });

    await user.click(screen.getByRole("tab", { name: "그래프" }));
    expect(screen.queryByRole("link", { name: /총보수 순위로/ })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "결과" }));
    expect(screen.getByRole("link", { name: /총보수 순위로/ })).toBeVisible();
  });

  test("chips from the retried stream show after a first stream is cut", async () => {
    vi.useFakeTimers();
    const complete = eventsWith(streamChips, streamChips);
    let calls = 0;
    const searchStream = vi.fn(async function* () {
      calls += 1;
      if (calls === 1) {
        yield* [start, interpretation, results, delta0];
        throw new StreamCutError();
      }
      yield* complete;
    });
    renderApp({
      api: testApi({ searchStream }),
      path: searchPath(answered.question),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 50);
    });
    expect(searchStream).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: /총보수 순위로/ })).toBeVisible();
  });

  test("a chip searches while the concept cards only open in place", async () => {
    setViewport(1280);
    const { user } = renderApp({
      api: replay(eventsWith(streamChips, streamChips)),
      path: searchPath(answered.question),
    });
    await screen.findByRole("heading", { name: "알아두면 좋은 개념" });
    const before = currentLocation();
    await user.click(screen.getByRole("button", { name: "자세히 보기" }));
    expect(currentLocation()).toBe(before);
    await user.click(screen.getByRole("link", { name: /분배 많은 순/ }));
    expect(currentLocation()).toContain("분배율 높은 국내 ETF 5개");
  });
});

describe("concept request timing on the stream", () => {
  test("the explanation is requested only after done, once", async () => {
    setViewport(1280);
    const stream = controlledStream();
    const api = apiWith(stream.gen);
    renderApp({ api, path: searchPath(answered.question) });
    await feed(stream.push, start, interpretation, results, delta0, delta1);
    await feed(stream.push, answerDone, suggestions);
    expect(api.explain).not.toHaveBeenCalled();

    // 실제 스트림은 done 뒤에 닫힌다. 화면은 스트림이 끝나야 done 응답으로 확정한다.
    await feed(stream.push, done);
    await act(async () => {
      stream.push("end");
    });
    await waitFor(() => expect(api.explain).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("heading", { name: "알아두면 좋은 개념" }),
    ).toBeVisible();
  });
});
