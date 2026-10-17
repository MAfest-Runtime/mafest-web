import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ambiguous,
  answered,
  caveat,
  errorOutcome,
  fallback,
  meta,
  noResult,
  notCollected,
  refused,
  unavailable,
} from "./lib/fixtures";
import { ApiError, type SearchResponse } from "./lib/types";
import {
  currentLocation,
  renderApp,
  resetViewport,
  searchPath,
  setViewport,
  testApi,
} from "./test/renderApp";

/*
 * 화면 테스트. 합성 API(지연 0 mock)로 화면 로직만 본다.
 * 요소는 접근성 이름(role·label·text)으로 찾는다.
 */

afterEach(() => {
  resetViewport();
  vi.useRealTimers();
});

function respondWith(response: SearchResponse) {
  return testApi({
    search: vi.fn().mockResolvedValue(structuredClone(response)),
  });
}

describe("홈", () => {
  test("예시 칩은 meta에서 오고, 누르면 그 질문으로 검색한다", async () => {
    const { user } = renderApp();
    const chip = await screen.findByRole("link", {
      name: new RegExp(meta.examples[0].question),
    });
    await user.click(chip);
    expect(currentLocation()).toBe(`/search?q=${meta.examples[0].question}`);
  });

  test("meta가 예시 4개를 주면 4개만 표시하고 마지막 질문도 검색한다", async () => {
    const examples = meta.examples.slice(0, 4);
    const { user } = renderApp({
      api: testApi({
        getMeta: vi.fn().mockResolvedValue({ ...meta, examples }),
      }),
    });
    const chip = await screen.findByRole("link", {
      name: new RegExp(examples[3].question),
    });
    const section = screen.getByRole("region", { name: "이렇게 물어보세요" });

    expect(within(section).getAllByRole("link")).toHaveLength(4);
    await user.click(chip);
    expect(currentLocation()).toBe(`/search?q=${examples[3].question}`);
  });

  test("홈은 검색만: 상품군 표·하지 않는 것은 없다", async () => {
    renderApp();
    await screen.findByRole("link", {
      name: new RegExp(meta.examples[0].question),
    });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("heading", { name: "하지 않는 것" })).toBeNull();
  });

  test("/about에 상품군별 건수와 기준일", async () => {
    renderApp({ path: "/about" });
    const table = await screen.findByRole("table", {
      name: /상품군별 상품 수/,
    });
    const row = within(table).getByRole("row", { name: /채권/ });
    expect(row).toHaveTextContent("4,210");
    expect(row).toHaveTextContent("2026-08-14");
  });

  test("질문을 입력해 제출하면 URL ?q=로 간다", async () => {
    const { user } = renderApp();
    await user.type(screen.getByLabelText("질문"), "  총보수 낮은 국내 ETF  ");
    await user.click(screen.getByRole("button", { name: "검색" }));
    expect(currentLocation()).toBe("/search?q=총보수 낮은 국내 ETF");
  });

  test("빈 질문은 보낼 수 없다", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "검색" })).toBeDisabled();
  });

  test("meta가 실패해도 검색창은 쓸 수 있다", async () => {
    renderApp({
      api: testApi({
        getMeta: vi.fn().mockRejectedValue(new ApiError(500, "x")),
      }),
    });
    expect(
      await screen.findByText(/예시 질문을 불러오지 못했습니다/),
    ).toBeVisible();
    expect(screen.getByLabelText("질문")).toBeEnabled();
  });

  test("하단 비공식 고지 띠는 없다(고지는 /about에만)", () => {
    renderApp();
    expect(screen.queryByText(/미래에셋증권과 무관/)).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  test("결과 화면에는 투자 고지가 붙는다", async () => {
    renderApp({ path: searchPath(answered.question) });
    expect(await screen.findByText(/투자권유가 아닙니다/)).toBeInTheDocument();
  });
});

describe("결과 — outcome 9종", () => {
  test("answered: 질문 해석·처리 과정·답변·표 (넓은 화면)", async () => {
    setViewport(1280);
    renderApp({
      api: respondWith(answered),
      path: searchPath(answered.question),
    });
    const answer = await screen.findByRole("region", { name: "답변" });
    expect(answer).toHaveTextContent(/SAMPLE 코스피200\(순자산 9\.1조 원/);
    expect(screen.getByText("AI 생성 문장")).toBeVisible();
    expect(screen.getAllByText("2026-08-21").length).toBeGreaterThan(0);
    expect(
      screen.getByText("총 1,180건 중 5건", { exact: false }),
    ).toBeVisible();
    // 인용 표시는 보조기술에도 전달된다.
    expect(screen.getAllByText("답변에 인용,").length).toBe(3);

    // ① 질문 해석: 구조와 다시 쓴 문장
    const interp = screen.getByRole("region", { name: "질문 해석" });
    expect(interp).toHaveTextContent("국내 ETF 중 상품을 순자산 큰 순으로 5개");
    expect(within(interp).getByText("찾음")).toBeVisible();
    expect(within(interp).getByText(/순자산 ↓/)).toBeVisible();

    // 해석 과정: 질문 표현 → 무엇으로 → 어떤 장치로
    const how = within(interp).getByRole("list", { name: "해석 과정" });
    const rows = within(how).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("순자산 큰");
    expect(rows[0]).toHaveTextContent("정렬");
    expect(rows[0]).toHaveTextContent("규칙");
    expect(rows[2]).toHaveTextContent("상위 5");

    // ② 처리 과정: 5단계가 항상 보이고, 세부 기록(쿼리)은 접혀 있다
    const process = screen.getByRole("region", { name: "어떻게 답했나" });
    const steps = within(process).getByRole("list", { name: "처리 단계" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(5);
    expect(within(process).getByText("근거 충분 → 문장 생성")).toBeVisible();
    expect(screen.getByText(/FROM sample_kr_etf/)).toBeInTheDocument();
  });

  test("답변의 숫자에 초점을 주면 표의 그 칸이 강조된다", async () => {
    setViewport(1280);
    const { user } = renderApp({
      api: respondWith(answered),
      path: searchPath(answered.question),
    });
    const cite = await screen.findByRole("button", { name: "9.1조 원" });
    await user.hover(cite);
    const cell = within(screen.getByRole("table")).getByRole("cell", {
      name: "9.1조 원",
    });
    expect(cell).toHaveAttribute("data-cite");
    await user.unhover(cite);
    expect(cell).not.toHaveAttribute("data-cite");
  });

  test("질문에 없는 해석(기본값)도 목록에 '질문에 없음'으로 보인다", async () => {
    renderApp({ api: respondWith(caveat), path: searchPath(caveat.question) });
    const how = await screen.findByRole("list", { name: "해석 과정" });
    const last = within(how).getAllByRole("listitem").at(-1)!;
    expect(last).toHaveTextContent("질문에 없음");
    expect(last).toHaveTextContent("상위 10");
    expect(last).toHaveTextContent("기본값");
  });

  test("정책 거절도 어떤 표현 때문인지 보인다", async () => {
    renderApp({
      api: respondWith(refused),
      path: searchPath(refused.question),
    });
    const how = await screen.findByRole("list", { name: "해석 과정" });
    expect(how).toHaveTextContent("추천해줘");
    expect(how).toHaveTextContent("상품 추천");
  });

  test("좁은 화면: 질문 해석은 늘 보이고 결과·처리 과정은 전환", async () => {
    const { user } = renderApp({
      api: respondWith(answered),
      path: searchPath(answered.question),
    });
    expect(
      await screen.findByRole("region", { name: "질문 해석" }),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "결과" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("region", { name: "어떻게 답했나" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "처리 과정" }));
    expect(screen.getByRole("region", { name: "어떻게 답했나" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "답변" })).toBeNull();
  });

  test("탐색 그래프: 클래스 → 집합 → 상품 경로와 좁혀진 건수 (넓은 화면)", async () => {
    setViewport(1280);
    renderApp({ api: respondWith(caveat), path: searchPath(caveat.question) });
    const graph = await screen.findByRole("region", { name: "탐색 그래프" });
    const narrow = within(graph).getByRole("list", { name: "좁혀진 건수" });
    expect(narrow).toHaveTextContent("국내 ETF1,180→에서7건");
    expect(narrow).toHaveTextContent("국내 ETN312→에서2건");
    const figure = within(graph).getByRole("group", {
      name: "탐색 그래프 그림",
    });
    expect(figure).toHaveTextContent("금융상품");
    expect(figure).toHaveTextContent("412건");
    // 그림을 못 보는 경우의 대체 설명
    const desc = within(graph).getByRole("list", { name: "그래프 설명" });
    expect(desc).toHaveTextContent("ETF·ETN: 금융상품의 하위 클래스");
    // 인용 상품은 표시가 붙은 링크
    expect(
      within(figure).getByRole("link", {
        name: "SAMPLE 코스피200 (답변 인용) 상세",
      }),
    ).toHaveAttribute("href", "/products/kr_etf/SMP001");
  });

  test("탐색 그래프: 상품을 누르면 오른쪽 패널, 해석 번호는 질문·목록·그래프가 함께 강조", async () => {
    setViewport(1280);
    const { user } = renderApp({ path: searchPath(answered.question) });
    const graph = await screen.findByRole("region", { name: "탐색 그래프" });
    const canvas = graph.querySelector(".graph__canvas")!;

    // 해석 목록 1번(순자산 큰 → 정렬)에 올리면 그래프의 같은 번호 요소가 켜진다
    const how = screen.getByRole("list", { name: "해석 과정" });
    await user.hover(within(how).getAllByRole("listitem")[0]);
    expect(canvas).toHaveAttribute("data-focusing");
    expect(
      canvas.querySelector(".gedge--constraint[data-active]"),
    ).not.toBeNull();
    await user.unhover(within(how).getAllByRole("listitem")[0]);
    expect(canvas).not.toHaveAttribute("data-focusing");

    // 그래프 쪽에서 올리면 질문 밑줄이 켜진다
    const s1 = [...canvas.querySelectorAll(".gnode--set")].find((n) =>
      n.textContent?.includes("상위 5"),
    )!;
    await user.hover(s1);
    expect(
      document.querySelector(".qmark[data-active]")?.textContent,
    ).toContain("5개");

    await user.click(
      within(graph).getByRole("link", { name: /DEMO 미국S&P500/ }),
    );
    expect(currentLocation()).toContain("p=kr_etf/DMO014");
    expect(
      screen.getByRole("complementary", { name: "상품 상세" }),
    ).toBeVisible();
  });

  test("탐색 그래프: 좁은 화면은 [결과 | 그래프 | 처리 과정] 탭, 장애는 표시로", async () => {
    const { user } = renderApp({
      api: respondWith(unavailable),
      path: searchPath(unavailable.question),
    });
    await user.click(await screen.findByRole("tab", { name: "그래프" }));
    const graph = screen.getByRole("region", { name: "탐색 그래프" });
    expect(
      within(graph).getByRole("list", { name: "좁혀진 건수" }),
    ).toHaveTextContent("장애");
    expect(graph).toHaveTextContent("구성종목");
    expect(graph).toHaveTextContent("HOLDS");
    expect(screen.queryByRole("region", { name: "답변" })).toBeNull();
  });

  test("탐색 그래프: 화면에 들어오면 층 순서대로 등장, 다시 보기로 재생", async () => {
    setViewport(1280);
    const observed: Element[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private cb: IntersectionObserverCallback) {}
        observe(el: Element) {
          observed.push(el);
          this.cb(
            [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        disconnect() {}
      },
    );
    try {
      const { user } = renderApp({
        api: respondWith(caveat),
        path: searchPath(caveat.question),
      });
      const graph = await screen.findByRole("region", { name: "탐색 그래프" });
      const canvas = graph.querySelector(".graph__canvas")!;
      await waitFor(() =>
        expect(canvas).toHaveAttribute("data-anim", "playing"),
      );
      expect(observed).toContain(canvas);

      // 상위 클래스 → 첫 집합 → 상품 순으로 늦게 나타난다
      const delayOf = (text: string) => {
        const node = [...canvas.querySelectorAll(".gnode")].find((n) =>
          n.textContent?.includes(text),
        )!;
        return parseInt(
          (node.parentElement as HTMLElement).style.getPropertyValue("--d"),
        );
      };
      expect(delayOf("금융상품")).toBe(0);
      expect(delayOf("국내 ETF 전체")).toBeGreaterThan(delayOf("ETF·ETN"));
      expect(delayOf("SAMPLE 코스피200")).toBeGreaterThan(
        delayOf("순자산 ↓ 상위 10"),
      );
      // 선은 앞 노드가 나타날 때 긋기 시작해 뒤 노드가 나타날 때 끝난다
      const drawn = canvas.querySelectorAll(".gedge--draw");
      expect(drawn.length).toBeGreaterThan(0);
      expect(drawn[0]).toHaveAttribute("pathLength", "1");

      const svg = canvas.querySelector("svg");
      await user.click(
        within(graph).getByRole("button", { name: "다시 보기" }),
      );
      expect(canvas.querySelector("svg")).not.toBe(svg);
      expect(canvas).toHaveAttribute("data-anim", "playing");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("탐색 그래프: 동작 줄이기 설정이면 애니메이션 없이 바로 보인다", async () => {
    setViewport(1280);
    const base = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...base(query),
      matches: query.includes("prefers-reduced-motion") || base(query).matches,
    })) as typeof window.matchMedia;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    try {
      renderApp({
        api: respondWith(caveat),
        path: searchPath(caveat.question),
      });
      const graph = await screen.findByRole("region", { name: "탐색 그래프" });
      expect(graph.querySelector(".graph__canvas")).not.toHaveAttribute(
        "data-anim",
      );
      expect(
        within(graph).queryByRole("button", { name: "다시 보기" }),
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("거절·오류는 그래프를 그리지 않는다", async () => {
    renderApp({
      api: respondWith(refused),
      path: searchPath(refused.question),
    });
    await screen.findByRole("region", { name: "질문 해석" });
    expect(screen.queryByRole("tab", { name: "그래프" })).toBeNull();
    expect(screen.queryByRole("region", { name: "탐색 그래프" })).toBeNull();
  });

  test("게이트에서 멈춘 경우: 생성 단계는 '모델 호출 안 함'", async () => {
    setViewport(1280);
    renderApp({
      api: respondWith(notCollected),
      path: searchPath(notCollected.question),
    });
    const process = await screen.findByRole("region", {
      name: "어떻게 답했나",
    });
    expect(
      within(process).getByText("수집하지 않은 항목 → 정해진 문장"),
    ).toBeVisible();
    expect(
      within(process).getByText("모델 호출 안 함 · 정해진 문장"),
    ).toBeVisible();
  });

  test("caveat: 주의 배지와 사유, 상품군별로 다른 기준일", async () => {
    renderApp({ api: respondWith(caveat), path: searchPath(caveat.question) });
    expect(await screen.findByText("주의")).toBeVisible();
    const reasons = screen.getByRole("list", { name: "주의 사유" });
    expect(reasons).toHaveTextContent("퇴직연금 가능 여부가 수집되지 않아");
    expect(screen.getByText(/국내 ETF 기준일/)).toBeVisible();
    expect(screen.getByText(/국내 ETN 기준일/)).toBeVisible();
    expect(screen.getAllByText("일부만").length).toBeGreaterThan(0);
  });

  test("no_result: 안내 + 조건 칩 + 완화 질문", async () => {
    renderApp({
      api: respondWith(noResult),
      path: searchPath(noResult.question),
    });
    expect(
      await screen.findByRole("heading", {
        name: "조건에 맞는 상품이 없습니다",
      }),
    ).toBeVisible();
    expect(screen.getByText("총보수 < 0.01%")).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "조건을 바꿔 보세요" });
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
  });

  test("not_collected: 무엇이 없는지 한 줄", async () => {
    renderApp({
      api: respondWith(notCollected),
      path: searchPath(notCollected.question),
    });
    expect(
      await screen.findByRole("heading", {
        name: "수집하지 않은 데이터입니다",
      }),
    ).toBeVisible();
    expect(screen.getByText(/없는 항목: 과거 추이/)).toBeVisible();
  });

  test("unavailable: 일시 장애 문구와 다시 시도(수집 범위 밖과 구분)", async () => {
    const api = respondWith(unavailable);
    const { user } = renderApp({ api, path: searchPath(unavailable.question) });
    expect(
      await screen.findByText(
        "지금 이 데이터를 불러올 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("수집하지 않은 데이터입니다")).toBeNull();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
  });

  test("ambiguous: 선택지를 누르면 구체화한 질문으로 다시 검색", async () => {
    const { user } = renderApp({
      api: respondWith(ambiguous),
      path: searchPath(ambiguous.question),
    });
    const nav = await screen.findByRole("navigation", {
      name: "구체화한 질문으로 다시 검색",
    });
    await user.click(within(nav).getByRole("link", { name: /AA- 이상/ }));
    expect(currentLocation()).toBe(
      `/search?q=${ambiguous.clarify!.options[1].question}`,
    );
  });

  test("refused: 이유와 대신 할 수 있는 질문", async () => {
    renderApp({
      api: respondWith(refused),
      path: searchPath(refused.question),
    });
    expect(
      await screen.findByRole("heading", { name: "답하지 않는 질문입니다" }),
    ).toBeVisible();
    const nav = screen.getByRole("navigation", {
      name: "대신 할 수 있는 질문",
    });
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
  });

  test("error: 요청 ID와 다시 시도", async () => {
    renderApp({ api: respondWith(errorOutcome), path: searchPath("오류") });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("답변을 만들지 못했습니다");
    expect(alert).toHaveTextContent(errorOutcome.request_id);
  });

  test.each([390, 1280])(
    "fallback: %ipx에서 내부 상태를 숨기고 답변·결과·고지를 유지",
    async (width) => {
      setViewport(width);
      const response = structuredClone(fallback);
      response.outcome = "caveat";
      response.answer.notices = [
        { code: "PARTIAL_AXIS", text: "값이 확인된 상품만 포함했습니다." },
      ];
      response.trace!.steps.push({
        stage: "verify",
        label: "검증",
        ms: 1,
        detail: "문장 0개 통과 · 탈락 1개 (NUMBER_OUTSIDE_SLOT)",
        query: null,
      });
      renderApp({ api: respondWith(response), path: searchPath("q") });
      expect(await screen.findByText(response.answer.text)).toBeVisible();
      expect(screen.queryByText(/답변 생성 모델이 꺼져 있어/)).toBeNull();
      expect(screen.queryByText("조회 결과만")).toBeNull();
      expect(screen.queryByText("AI 생성 문장")).toBeNull();
      expect(screen.queryByText(/NUMBER_OUTSIDE_SLOT/)).toBeNull();
      expect(screen.queryByText(/모델 응답 없음/)).toBeNull();
      expect(
        screen.queryByRole("region", { name: "어떻게 답했나" }),
      ).toBeNull();
      expect(screen.queryByRole("tab", { name: "처리 과정" })).toBeNull();
      expect(
        screen.getByText("값이 확인된 상품만 포함했습니다."),
      ).toBeVisible();
      expect(screen.getAllByText(/기준일/).length).toBeGreaterThan(0);
      expect(screen.getByText("주의", { exact: true })).toBeVisible();
      expect(
        screen.getByRole("link", {
          name: width >= 720 ? "SAMPLE 코스피200" : /^SAMPLE 코스피200 순자산/,
        }),
      ).toBeVisible();
      // 표시 정책만 바뀌며 원래 응답의 생성 방식과 실패 기록은 그대로 남는다.
      expect(response.answer.generated_by).toBe("fallback");
      expect(response.trace!.steps.at(-1)?.detail).toContain(
        "NUMBER_OUTSIDE_SLOT",
      );
    },
  );
});

describe("결과 — HTTP 실패와 로딩", () => {
  test("429: 남은 초를 세고 그동안 다시 시도를 막는다", async () => {
    renderApp({
      api: testApi({
        search: vi
          .fn()
          .mockRejectedValue(new ApiError(429, "rate_limited", 12)),
      }),
      path: searchPath("q"),
    });
    expect(await screen.findByText("요청이 너무 많습니다")).toBeVisible();
    expect(
      screen.getByText("12초 뒤에 다시 시도할 수 있습니다."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeDisabled();
  });

  test("504: 시간 초과 안내", async () => {
    renderApp({
      api: testApi({
        search: vi.fn().mockRejectedValue(new ApiError(504, "timeout")),
      }),
      path: searchPath("q"),
    });
    expect(
      await screen.findByText("처리 결과를 확인하지 못했습니다"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "같은 요청으로 확인" }),
    ).toBeVisible();
    expect(screen.queryByText(/30초/)).toBeNull();
  });

  test("로딩 중에는 경과 초를 보여준다", async () => {
    renderApp({
      api: testApi({ search: vi.fn(() => new Promise<never>(() => {})) }),
      path: searchPath("q"),
    });
    expect(await screen.findByRole("status")).toHaveTextContent("검색 중");
  });

  test("200자를 넘는 URL 질문은 보내지 않는다", async () => {
    const api = testApi();
    renderApp({ api, path: searchPath("가".repeat(201)) });
    expect(await screen.findByText("질문 형식이 맞지 않습니다")).toBeVisible();
    expect(api.search).not.toHaveBeenCalled();
  });

  test("질문을 바꾸면 이전 요청을 끊는다", async () => {
    const signals: AbortSignal[] = [];
    const api = testApi({
      search: vi.fn((_q: string, signal?: AbortSignal) => {
        signals.push(signal!);
        return new Promise<never>(() => {});
      }),
    });
    const { user } = renderApp({ api, path: searchPath("첫 질문") });
    await waitFor(() => expect(signals).toHaveLength(1));
    const input = screen.getByLabelText("질문");
    await user.clear(input);
    await user.type(input, "둘째 질문{Enter}");
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);
  });
});

describe("상품 상세", () => {
  test("좁은 화면: 카드를 누르면 상세 페이지로 간다", async () => {
    const { user } = renderApp({ path: searchPath(answered.question) });
    await user.click(
      await screen.findByRole("link", { name: /SAMPLE 코스피200/ }),
    );
    expect(currentLocation()).toBe("/products/kr_etf/SMP001");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "SAMPLE 코스피200",
      }),
    ).toBeVisible();
  });

  test("넓은 화면: 표의 상품을 누르면 오른쪽 패널에 연다(URL에 p)", async () => {
    setViewport(1280);
    const { user } = renderApp({ path: searchPath(answered.question) });
    const table = await screen.findByRole("table");
    await user.click(
      within(table).getByRole("link", { name: /DEMO 미국S&P500/ }),
    );
    expect(currentLocation()).toContain("p=kr_etf/DMO014");
    const panel = screen.getByRole("complementary", { name: "상품 상세" });
    expect(
      await within(panel).findByRole("heading", { name: "DEMO 미국S&P500" }),
    ).toBeVisible();
    await user.click(within(panel).getByRole("button", { name: "닫기" }));
    expect(
      screen.queryByRole("complementary", { name: "상품 상세" }),
    ).toBeNull();
  });

  test("넓은 화면: 숫자 열은 오른쪽 정렬, 정렬 축은 aria-sort", async () => {
    setViewport(1280);
    renderApp({ path: searchPath(answered.question) });
    const table = await screen.findByRole("table");
    const header = within(table).getByRole("columnheader", { name: "순자산" });
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(header).toHaveClass("num");
    expect(within(table).getByRole("cell", { name: "+12.3%" })).toHaveClass(
      "num",
    );
  });

  test("값마다 출처·기준일, 관계는 관련 검색 링크", async () => {
    renderApp({ path: "/products/kr_etf/SMP001" });
    await screen.findByRole("heading", { level: 1, name: "SAMPLE 코스피200" });
    expect(screen.getAllByText("계산값").length).toBeGreaterThan(0);
    expect(screen.getAllByText("미제공").length).toBeGreaterThan(0);
    const link = screen.getByRole("link", { name: /SAMPLE전자/ });
    expect(link).toHaveAttribute(
      "href",
      `/search?q=${encodeURIComponent("SAMPLE전자를 편입한 국내 ETF")}`,
    );
    // 대량 수집 억제: 이전/다음 상품 링크가 없다.
    expect(screen.queryByRole("link", { name: /다음|이전/ })).toBeNull();
  });

  test("없는 상품은 404 안내", async () => {
    renderApp({ path: "/products/kr_etf/NOPE" });
    expect(await screen.findByText("찾을 수 없습니다")).toBeVisible();
  });
});

describe("기타 화면", () => {
  test("/about: 기록 정책과 고지", async () => {
    renderApp({ path: "/about" });
    expect(
      screen.getByRole("heading", { level: 1, name: "동작 방식" }),
    ).toBeVisible();
    expect(screen.getByText(/IP 주소 등 접속 정보는 저장하지/)).toBeVisible();
    expect(
      screen.getByText(/질문 원문과 질문 해시는 저장하지 않습니다/),
    ).toBeVisible();
    expect(screen.getAllByText(/미래에셋증권과 무관/).length).toBeGreaterThan(
      0,
    );
  });

  test("알 수 없는 주소", () => {
    renderApp({ path: "/personas" });
    expect(
      screen.getByRole("heading", { name: "페이지를 찾을 수 없습니다" }),
    ).toBeVisible();
  });

  test("meta가 모델 꺼짐을 알리면 헤더에 배지", async () => {
    renderApp({
      api: testApi({
        getMeta: vi.fn().mockResolvedValue({ ...meta, llm_available: false }),
      }),
    });
    expect(await screen.findByText("생성 모델 꺼짐")).toBeVisible();
  });
});
