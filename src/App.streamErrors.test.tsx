import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { httpApi } from "./lib/api";
import { meta, STREAM_FIXTURES, type StreamFixtureEvent } from "./lib/fixtures";
import { RETRY_DELAY_MS } from "./lib/searchStream";
import { renderApp, resetViewport, searchPath } from "./test/renderApp";

/*
 * 실제 api.ts(가짜 fetch) 위에서 깨진 스트림이 오류 화면으로 가는지 본다. 깨진 이벤트는 그려지지 않는다.
 */

const encoder = new TextEncoder();
const normal = STREAM_FIXTURES.answered;

function metaResponse(): Response {
  return new Response(JSON.stringify(meta), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** App 은 첫 화면에서 /v1/meta 도 부른다. meta 는 합성 응답으로 답하고 나머지 경로만 시나리오가 정한다. */
function stubFetch(handler: (path: string) => Response | Promise<Response>) {
  const fetchMock = vi.fn().mockImplementation((path: string) =>
    path === "/v1/meta"
      ? Promise.resolve(metaResponse())
      : path === "/v1/explain"
        ? // 개념 설명은 이 파일이 보는 검색 경로와 별개다. 근거 없음으로 답해 검색 호출 목록에서 뺀다.
          Promise.resolve(
            new Response(JSON.stringify({ topics: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        : Promise.resolve(handler(path)),
  );
  vi.stubGlobal("fetch", fetchMock);
  const searchCalls = () =>
    fetchMock.mock.calls
      .map((c) => c[0] as string)
      .filter((p) => p !== "/v1/meta" && p !== "/v1/explain");
  return { fetchMock, searchCalls };
}

function sse(events: StreamFixtureEvent[]): Response {
  const text = events
    .map(
      ({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
    .join(": ping\n\n");
  return new Response(encoder.encode(text), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => {
  resetViewport();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const orderBroken: [string, StreamFixtureEvent[]][] = [
  ["does not start with start", normal.slice(1)],
  [
    "sends answer_delta before results",
    [normal[0], normal[1], normal[3], normal[2], ...normal.slice(4)],
  ],
  ["skips interpretation", [normal[0], ...normal.slice(2)]],
];

describe("broken streams go to the error screen", () => {
  test.each(orderBroken)(
    "a stream that %s shows the invalid response screen and no answer",
    async (_, events) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { searchCalls } = stubFetch(() => sse(events));
      renderApp({ api: httpApi, path: searchPath("순자산 큰 국내 ETF") });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "응답 형식이 올바르지 않습니다",
      );
      expect(screen.queryByRole("region", { name: "답변" })).toBeNull();
      // 계약 위반은 연결 끊김이 아니므로 다시 요청하지 않는다.
      expect(searchCalls()).toEqual(["/v1/search/stream"]);
    },
  );

  test("a stream that ends without done is retried once and then shows the connection failure", async () => {
    vi.useFakeTimers();
    const { searchCalls } = stubFetch(() => sse(normal.slice(0, -1)));
    renderApp({ api: httpApi, path: searchPath("순자산 큰 국내 ETF") });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 5);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "처리 결과를 확인하지 못했습니다",
    );
    expect(searchCalls()).toEqual(["/v1/search/stream", "/v1/search/stream"]);
  });

  test("a stream that is unavailable falls back to the plain search once", async () => {
    const { searchCalls } = stubFetch((path) =>
      path === "/v1/search/stream"
        ? new Response("", { status: 502 })
        : new Response(JSON.stringify(normalResponse()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
    );
    renderApp({ api: httpApi, path: searchPath("순자산 큰 국내 ETF") });
    expect(await screen.findByRole("region", { name: "답변" })).toBeVisible();
    expect(searchCalls()).toEqual(["/v1/search/stream", "/v1/search"]);
  });

  test("422 before opening shows the form error without falling back", async () => {
    const { searchCalls } = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            code: "invalid_question",
            message: "질문 형식이 맞지 않습니다.",
            request_id: "r-422",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
    );
    renderApp({ api: httpApi, path: searchPath("순자산 큰 국내 ETF") });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "질문 형식이 맞지 않습니다",
    );
    expect(searchCalls()).toEqual(["/v1/search/stream"]);
  });
});

function normalResponse() {
  const done = normal[normal.length - 1].data as { response: unknown };
  return done.response;
}
