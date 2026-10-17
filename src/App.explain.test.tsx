import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  answered,
  CONCEPT_TOPICS,
  fallback,
  noResult,
  refused,
} from "./lib/fixtures";
import {
  ApiError,
  type ExplainResponse,
  type SearchApi,
  type SearchResponse,
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
 * 개념 설명 카드 화면 테스트. 설명 API는 합성 mock이다 — 실서버에 연결해 확인한 것이 아니다.
 * 검색 결과와 설명은 별개 요청이고, 설명이 어떻게 끝나도 요약·표는 그대로여야 한다.
 */

afterEach(() => {
  resetViewport();
  vi.useRealTimers();
});

function searchOnly(response: SearchResponse): SearchApi["search"] {
  return vi.fn().mockResolvedValue(structuredClone(response));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const HEADING = "알아두면 좋은 개념";

describe("concept cards", () => {
  test("show below the table and above the follow-up chips with source and review date after opening", async () => {
    setViewport(1280);
    const { user } = renderApp({
      api: testApi({ search: searchOnly(answered) }),
      path: searchPath(answered.question),
    });
    const heading = await screen.findByRole("heading", { name: HEADING });
    const answer = screen.getByRole("region", { name: "답변" });
    const table = screen.getByRole("table");
    const chips = screen.getByRole("navigation", {
      name: "이어서 물어볼 질문",
    });
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(answer, table)).toBe(true);
    expect(follows(table, heading)).toBe(true);
    expect(follows(heading, chips)).toBe(true);

    const card = screen.getByRole("article", {
      name: CONCEPT_TOPICS.aum.title,
    });
    expect(within(card).getByText(CONCEPT_TOPICS.aum.summary)).toBeVisible();
    expect(within(card).queryByText(CONCEPT_TOPICS.aum.detail)).toBeNull();

    await user.click(within(card).getByRole("button", { name: "자세히 보기" }));
    expect(within(card).getByText(CONCEPT_TOPICS.aum.detail)).toBeVisible();
    const link = within(card).getByRole("link", {
      name: CONCEPT_TOPICS.aum.sources[0].title,
    });
    expect(link).toHaveAttribute("href", CONCEPT_TOPICS.aum.sources[0].url);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(card).getByText(/검토일 2026-10-01/)).toBeVisible();
  });

  test("opening and closing the detail sends no further request and does not search", async () => {
    setViewport(1280);
    const api = testApi({ search: searchOnly(answered) });
    const { user } = renderApp({ api, path: searchPath(answered.question) });
    await screen.findByRole("heading", { name: HEADING });
    const location = currentLocation();

    const toggle = screen.getByRole("button", { name: "자세히 보기" });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "접기" }));
    await user.click(screen.getByRole("button", { name: "자세히 보기" }));

    expect(api.explain).toHaveBeenCalledTimes(1);
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(currentLocation()).toBe(location);
  });

  test("request body carries only the applied domains, condition axes and sort axis", async () => {
    setViewport(1280);
    const api = testApi({ search: searchOnly(answered) });
    renderApp({ api, path: searchPath("비밀 질문 문장") });
    await screen.findByRole("heading", { name: HEADING });

    const [body] = (api.explain as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(body).toEqual({
      domains: ["kr_etf"],
      axes: [],
      sort_axis: "aum",
    });
    expect(JSON.stringify(body)).not.toContain("비밀 질문 문장");
  });

  test("asks once per search run even when the narrow-screen tab is switched back and forth", async () => {
    setViewport(390);
    const api = testApi({ search: searchOnly(answered) });
    const { user } = renderApp({ api, path: searchPath(answered.question) });
    await screen.findByRole("heading", { name: HEADING });

    await user.click(screen.getByRole("tab", { name: "그래프" }));
    await user.click(screen.getByRole("tab", { name: "결과" }));

    expect(screen.getByRole("heading", { name: HEADING })).toBeVisible();
    expect(api.explain).toHaveBeenCalledTimes(1);
  });

  test("shows at most two topics", async () => {
    setViewport(1280);
    const many: ExplainResponse = {
      topics: [CONCEPT_TOPICS.aum, CONCEPT_TOPICS.expense_ratio],
    };
    renderApp({
      api: testApi({
        search: searchOnly(answered),
        explain: vi.fn().mockResolvedValue(many),
      }),
      path: searchPath(answered.question),
    });
    await screen.findByRole("heading", { name: HEADING });
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });
});

describe("concept cards stay out of the way", () => {
  test("a failed explanation leaves the answer and table, shows nothing and does not search again", async () => {
    setViewport(1280);
    const explain = vi.fn().mockRejectedValue(new ApiError(500, "internal"));
    const api = testApi({ search: searchOnly(answered), explain });
    renderApp({ api, path: searchPath(answered.question) });
    await screen.findByRole("region", { name: "답변" });
    await waitFor(() => expect(explain).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
    expect(screen.queryByText(/설명을 불러오지/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(explain).toHaveBeenCalledTimes(1);
  });

  test("an empty topic list draws no card, heading or notice", async () => {
    setViewport(1280);
    const explain = vi.fn().mockResolvedValue({ topics: [] });
    renderApp({
      api: testApi({ search: searchOnly(answered), explain }),
      path: searchPath(answered.question),
    });
    await screen.findByRole("region", { name: "답변" });
    await waitFor(() => expect(explain).toHaveBeenCalled());

    expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(document.querySelector(".concepts")).toBeNull();
  });

  test("loading shows a small placeholder while the answer and table are already visible", async () => {
    setViewport(1280);
    const pending = deferred<ExplainResponse>();
    renderApp({
      api: testApi({
        search: searchOnly(answered),
        explain: vi.fn().mockReturnValue(pending.promise),
      }),
      path: searchPath(answered.question),
    });
    await screen.findByText(/관련 개념을 찾고 있습니다/);
    expect(screen.getByRole("region", { name: "답변" })).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();

    await act(async () => pending.resolve({ topics: [CONCEPT_TOPICS.aum] }));
    expect(await screen.findByRole("heading", { name: HEADING })).toBeVisible();
    expect(screen.queryByText(/관련 개념을 찾고 있습니다/)).toBeNull();
  });

  test.each([
    ["refused", refused, "답하지 않는 질문입니다"],
    ["no_result", noResult, "조건에 맞는 상품이 없습니다"],
  ])("%s outcome never asks for an explanation", async (_, fixture, title) => {
    const api = testApi({ search: searchOnly(fixture) });
    renderApp({ api, path: searchPath(fixture.question) });
    await screen.findByRole("heading", { name: title });
    expect(api.explain).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
  });

  test("the removed model-off notice does not come back when an explanation fails", async () => {
    renderApp({
      api: testApi({
        search: searchOnly(fallback),
        explain: vi.fn().mockRejectedValue(new ApiError(0, "network")),
      }),
      path: searchPath(fallback.question),
    });
    await screen.findByRole("region", { name: "답변" });
    expect(document.body.textContent).not.toMatch(
      /답변 생성 모델이 꺼져|조회 결과만 보여줍니다|모델 응답 없음/,
    );
  });
});

describe("concept requests across searches", () => {
  test("a new question aborts the previous request and a late reply never reaches the new screen", async () => {
    setViewport(1280);
    const first = deferred<ExplainResponse>();
    const signals: AbortSignal[] = [];
    const explain = vi
      .fn()
      .mockImplementationOnce((_body, signal: AbortSignal) => {
        signals.push(signal);
        return first.promise;
      })
      .mockResolvedValue({ topics: [CONCEPT_TOPICS.expense_ratio] });
    const second: SearchResponse = {
      ...structuredClone(answered),
      request_id: "mock-answered-0002",
      question: "총보수 낮은 국내 ETF 5개",
    };
    const search = vi
      .fn()
      .mockResolvedValueOnce(structuredClone(answered))
      .mockResolvedValue(second);
    const { user } = renderApp({
      api: testApi({ search, explain }),
      path: searchPath(answered.question),
    });
    await screen.findByText(/관련 개념을 찾고 있습니다/);

    await user.click(
      await screen.findByRole("link", { name: /총보수 순위로/ }),
    );
    expect(
      await screen.findByRole("article", { name: "총보수" }),
    ).toBeVisible();
    expect(signals[0].aborted).toBe(true);

    await act(async () => first.resolve({ topics: [CONCEPT_TOPICS.aum] }));
    expect(screen.queryByRole("article", { name: "순자산" })).toBeNull();
    expect(explain).toHaveBeenCalledTimes(2);
  });

  test("retrying a failed search does not reuse the earlier explanation state", async () => {
    setViewport(1280);
    const explain = vi.fn().mockResolvedValue({ topics: [CONCEPT_TOPICS.aum] });
    const search = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, "internal"))
      .mockResolvedValue(structuredClone(answered));
    const { user } = renderApp({
      api: testApi({ search, explain }),
      path: searchPath(answered.question),
    });
    expect(explain).not.toHaveBeenCalled();
    await user.click(
      await screen.findByRole("button", { name: /같은 요청으로 확인/ }),
    );
    expect(await screen.findByRole("heading", { name: HEADING })).toBeVisible();
    expect(explain).toHaveBeenCalledTimes(1);
  });
});

describe("600 character summary", () => {
  test("the whole summary is drawn as plain text without cutting or interpreting markup", async () => {
    setViewport(1280);
    const sentence = "순자산이 큰 순서로 보면 표의 첫 상품이 가장 큽니다. ";
    const text = (sentence.repeat(20) + "<b>굵게</b>").slice(0, 600);
    const response = structuredClone(answered);
    response.answer.text = text;
    renderApp({
      api: testApi({ search: searchOnly(response) }),
      path: searchPath(response.question),
    });
    const region = await screen.findByRole("region", { name: "답변" });

    expect(text).toHaveLength(600);
    expect(region.textContent).toContain(text.trim());
    expect(region.querySelector("b")).toBeNull();
    expect(region.textContent).not.toContain("…");
  });
});

describe("server-provided internal source", () => {
  const internal: ExplainResponse = {
    topics: [
      {
        id: "aum",
        title: "순자산",
        summary: "서버가 만든 짧은 설명입니다.",
        detail: "서버가 만든 상세 설명입니다.",
        sources: [
          {
            title: "내부 조회 자료 · 순자산 항목 설명",
            url: "https://example.org/mafest-data/blob/v2026.10.1/concepts/aum.md",
          },
        ],
        reviewed_at: "2026-09-30",
      },
    ],
  };

  test("shows the server title, address, review date and texts unchanged", async () => {
    setViewport(1280);
    const { user } = renderApp({
      api: testApi({
        search: searchOnly(answered),
        explain: vi.fn().mockResolvedValue(structuredClone(internal)),
      }),
      path: searchPath(answered.question),
    });
    const card = await screen.findByRole("article", { name: "순자산" });
    expect(
      within(card).getByText("서버가 만든 짧은 설명입니다."),
    ).toBeVisible();

    await user.click(within(card).getByRole("button", { name: "자세히 보기" }));

    expect(
      within(card).getByText("서버가 만든 상세 설명입니다."),
    ).toBeVisible();
    const link = within(card).getByRole("link", {
      name: "내부 조회 자료 · 순자산 항목 설명",
    });
    expect(link).toHaveAttribute("href", internal.topics[0].sources[0].url);
    expect(within(card).getByText("검토일 2026-09-30")).toBeVisible();
  });

  test("the scope note appears only with topics, never while loading or when empty or failed", async () => {
    setViewport(1280);
    const NOTE = /일반적인 개념 설명입니다/;
    const pending = deferred<ExplainResponse>();
    const explain = vi.fn().mockReturnValue(pending.promise);
    renderApp({
      api: testApi({ search: searchOnly(answered), explain }),
      path: searchPath(answered.question),
    });
    await screen.findByText(/관련 개념을 찾고 있습니다/);
    expect(screen.queryByText(NOTE)).toBeNull();

    await act(async () => pending.resolve(structuredClone(internal)));
    expect(await screen.findByText(NOTE)).toBeVisible();
  });

  test.each([
    ["an empty list", () => Promise.resolve({ topics: [] })],
    ["a failure", () => Promise.reject(new ApiError(500, "internal"))],
  ])("%s leaves no scope note", async (_, reply) => {
    setViewport(1280);
    const explain = vi.fn().mockImplementation(reply);
    renderApp({
      api: testApi({ search: searchOnly(answered), explain }),
      path: searchPath(answered.question),
    });
    await screen.findByRole("region", { name: "답변" });
    await waitFor(() => expect(explain).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/일반적인 개념 설명입니다/)).toBeNull();
  });

  test("the concept area holds no search links; follow-up chips stay a separate group", async () => {
    setViewport(1280);
    renderApp({
      api: testApi({ search: searchOnly(answered) }),
      path: searchPath(answered.question),
    });
    const concepts = (
      await screen.findByRole("heading", { name: HEADING })
    ).closest("section")!;
    expect(
      concepts.querySelectorAll("a[href^='/search'], a[href*='?q=']"),
    ).toHaveLength(0);
    expect(
      screen.getByRole("navigation", { name: "이어서 물어볼 질문" }),
    ).toBeVisible();
  });
});
