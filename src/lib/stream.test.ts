import { afterEach, describe, expect, test, vi } from "vitest";
import { httpApi } from "./api";
import {
  answered,
  confirmationRequired,
  STREAM_FIXTURES,
  type StreamFixtureEvent,
} from "./fixtures";
import { createMockApi } from "./mockApi";
import {
  applyEvent,
  emptyView,
  provisionalResponse,
  RETRY_DELAY_MS,
  runSearchStream,
  streamPhase,
  type StreamView,
} from "./searchStream";
import { parseSse, STREAM_IDLE_TIMEOUT_MS } from "./sse";
import {
  ApiError,
  StreamCutError,
  StreamUnavailableError,
  type SearchApi,
  type StreamEvent,
} from "./types";
import { ContractError, validateStream } from "./validate";

/*
 * 스트림 파서·스트림 호출(api.ts)·실행기(searchStream.ts). 서버 없이 가짜 fetch와 가짜 API로 본다.
 */

const encoder = new TextEncoder();

function encode(events: StreamFixtureEvent[], extra = ""): Uint8Array {
  const text = events
    .map(
      ({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
    .join(`: ping\n\n`);
  return encoder.encode(text + extra);
}

function split(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size)
    chunks.push(bytes.slice(i, i + size));
  return chunks;
}

/** 청크 목록을 차례로 내는 본문. failAfter 를 주면 그 뒤 읽기가 오류로 끝난다(연결 끊김). */
function bodyOf(
  chunks: Uint8Array[],
  failAfter = false,
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
      } else if (failAfter) {
        controller.error(new TypeError("network error"));
      } else {
        controller.close();
      }
    },
  });
}

function sseResponse(chunks: Uint8Array[], failAfter = false): Response {
  return new Response(bodyOf(chunks, failAfter), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** 청크를 직접 밀어 넣고 EOF는 보내지 않는 본문. 유휴 감시와 terminal 취소를 확인할 때 쓴다. */
function controlledSseResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
    },
    cancel,
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    push(text: string) {
      controller.enqueue(encoder.encode(text));
    },
    cancel,
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("parseSse", () => {
  const events: StreamFixtureEvent[] = [
    { event: "start", data: { request_id: "r1", question: "질문" } },
    { event: "answer_delta", data: { index: 0, text: "한글 문장입니다." } },
  ];

  test("ignores ping comment lines", async () => {
    const bytes = encoder.encode(
      `: ping\n\nevent: start\ndata: {"a":1}\n\n: ping\n\n`,
    );
    const parsed = await collect(parseSse(bodyOf([bytes])));
    expect(parsed).toEqual([{ event: "start", data: { a: 1 } }]);
  });

  test.each([1, 2, 3, 7, 64])(
    "reads the same events when chunks are %i bytes",
    async (size) => {
      const parsed = await collect(
        parseSse(bodyOf(split(encode(events), size))),
      );
      expect(parsed).toEqual(events);
    },
  );

  test("keeps a Hangul character that is cut in the middle of its bytes", async () => {
    const bytes = encode([{ event: "answer_delta", data: { text: "한글" } }]);
    const at = bytes.indexOf(0xed) + 1; // "한"의 첫 바이트 다음
    const parsed = await collect(
      parseSse(bodyOf([bytes.slice(0, at), bytes.slice(at)])),
    );
    expect(parsed).toEqual([{ event: "answer_delta", data: { text: "한글" } }]);
  });

  test("accepts CRLF line breaks even when CR and LF are in different chunks", async () => {
    const text = 'event: start\r\ndata: {"a":1}\r\n\r\n';
    const bytes = encoder.encode(text);
    const cut = text.indexOf("\r\n\r\n") + 1; // 첫 CR 뒤에서 자른다
    const parsed = await collect(
      parseSse(bodyOf([bytes.slice(0, cut), bytes.slice(cut)])),
    );
    expect(parsed).toEqual([{ event: "start", data: { a: 1 } }]);
  });

  test("joins multi-line data with a line feed", async () => {
    const bytes = encoder.encode('event: start\ndata: {"a":\ndata: 1}\n\n');
    expect(await collect(parseSse(bodyOf([bytes])))).toEqual([
      { event: "start", data: { a: 1 } },
    ]);
  });

  test("drops an event that has no blank line before the connection ends", async () => {
    const bytes = encoder.encode('event: start\ndata: {"a":1}\n');
    expect(await collect(parseSse(bodyOf([bytes])))).toEqual([]);
  });

  test("fails with a contract error when data is not JSON", async () => {
    const bytes = encoder.encode("event: start\ndata: {nope\n\n");
    await expect(collect(parseSse(bodyOf([bytes])))).rejects.toBeInstanceOf(
      ContractError,
    );
  });
});

describe("httpApi.searchStream", () => {
  const normal = STREAM_FIXTURES.answered;

  function stubFetch(response: Response | { fails: unknown }) {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        response instanceof Response
          ? Promise.resolve(response)
          : Promise.reject(response.fails),
      );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  test("posts the question to the stream path asking for event-stream", async () => {
    const fetchMock = stubFetch(sseResponse([encode(normal)]));
    await collect(httpApi.searchStream("순자산 큰 국내 ETF 5개"));
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/v1/search/stream");
    expect(init.method).toBe("POST");
    expect(init.headers.Accept).toBe("text/event-stream");
    expect(JSON.parse(init.body)).toEqual({
      question: "순자산 큰 국내 ETF 5개",
    });
  });

  test("yields every event in order and ends after done", async () => {
    stubFetch(sseResponse(split(encode(normal), 5)));
    const events = await collect(httpApi.searchStream("q"));
    expect(events.map((e) => e.event)).toEqual(normal.map((e) => e.event));
  });

  test("cancels the reader immediately after done without waiting for EOF", async () => {
    const stream = controlledSseResponse();
    stubFetch(stream.response);
    stream.push(new TextDecoder().decode(encode(normal)));

    const events = await collect(httpApi.searchStream("q"));

    expect(events.map((event) => event.event)).toEqual(
      normal.map((event) => event.event),
    );
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  test("cancels the reader immediately after error without waiting for EOF", async () => {
    const stream = controlledSseResponse();
    const error = {
      event: "error",
      data: {
        code: "timeout",
        message: "실패했습니다.",
        request_id: "r-err",
      },
    };
    stubFetch(stream.response);
    stream.push(
      new TextDecoder().decode(encode([...normal.slice(0, 3), error])),
    );

    await expect(collect(httpApi.searchStream("q"))).rejects.toMatchObject({
      status: 504,
      code: "timeout",
    });
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  test("treats thirty seconds without bytes as a cut and ping resets the idle timer", async () => {
    vi.useFakeTimers();
    const stream = controlledSseResponse();
    stubFetch(stream.response);
    const settled = collect(httpApi.searchStream("q")).catch(
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS - 1);
    expect(stream.cancel).not.toHaveBeenCalled();
    stream.push(": ping\n\n");
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS - 1);
    expect(stream.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(await settled).toBeInstanceOf(StreamCutError);
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(STREAM_IDLE_TIMEOUT_MS).toBe(30_000);
  });

  test("ignores ping comments between events", async () => {
    stubFetch(sseResponse([encode(normal)]));
    expect(await collect(httpApi.searchStream("q"))).toHaveLength(
      normal.length,
    );
  });

  test("sends the run key as Idempotency-Key and nothing else identifying", async () => {
    const fetchMock = stubFetch(sseResponse([encode(normal)]));
    await collect(httpApi.searchStream("q", undefined, "run-key-abcdef-0001"));
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBe("run-key-abcdef-0001");
    expect(Object.keys(init.headers).sort()).toEqual([
      "Accept",
      "Content-Type",
      "Idempotency-Key",
    ]);
  });

  describe("confirmation_required", () => {
    const confirmation = STREAM_FIXTURES.confirmation;

    test("ends the stream normally without done and cancels the reader", async () => {
      const stream = controlledSseResponse();
      stubFetch(stream.response);
      stream.push(new TextDecoder().decode(encode(confirmation)));

      const events = await collect(httpApi.searchStream("q"));

      expect(events.map((e) => e.event)).toEqual([
        "start",
        "confirmation_required",
      ]);
      expect(stream.cancel).toHaveBeenCalledTimes(1);
    });

    test.each([
      ["results before it", [normal[0], normal[1], normal[2], confirmation[1]]],
      [
        "a session without secret",
        [
          confirmation[0],
          {
            event: "confirmation_required",
            data: {
              ...(confirmation[1].data as { session: object }),
              session: {
                id: "sample-session-0123456789abcdef",
                version: 1,
                expires_at: "2030-01-01T00:10:00Z",
              },
            },
          },
        ],
      ],
    ])("treats %s as an invalid response", async (_, events) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      stubFetch(sseResponse([encode(events)]));
      await expect(collect(httpApi.searchStream("q"))).rejects.toMatchObject({
        status: 200,
        code: "invalid_response",
      });
    });
  });

  test("422 before the stream opens is a JSON error", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          code: "invalid_question",
          message: "질문 형식이 맞지 않습니다.",
          request_id: "r-422",
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(collect(httpApi.searchStream("q"))).rejects.toMatchObject({
      status: 422,
      code: "invalid_question",
    });
  });

  test("429 keeps Retry-After and is not treated as unavailable", async () => {
    stubFetch(
      new Response("rate limit", {
        status: 429,
        headers: { "Content-Type": "text/plain", "Retry-After": "12" },
      }),
    );
    await expect(collect(httpApi.searchStream("q"))).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfter: 12,
    });
  });

  test.each([
    ["a 502 before opening", () => new Response("", { status: 502 })],
    ["a missing stream path (404)", () => new Response("", { status: 404 })],
    [
      "a 200 that is not event-stream",
      () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ],
  ])("%s means the stream is unavailable", async (_, make) => {
    stubFetch(make());
    await expect(collect(httpApi.searchStream("q"))).rejects.toBeInstanceOf(
      StreamUnavailableError,
    );
  });

  test("a connection failure before opening means the stream is unavailable", async () => {
    stubFetch({ fails: new TypeError("Failed to fetch") });
    await expect(collect(httpApi.searchStream("q"))).rejects.toBeInstanceOf(
      StreamUnavailableError,
    );
  });

  test.each([
    ["timeout", 504],
    ["internal", 500],
  ])(
    "an error event %s becomes the matching HTTP-style error",
    async (code, status) => {
      const head = normal.slice(0, 3);
      const error = {
        event: "error",
        data: { code, message: "실패했습니다.", request_id: "r-err" },
      };
      stubFetch(sseResponse([encode([...head, error])]));
      await expect(collect(httpApi.searchStream("q"))).rejects.toMatchObject({
        status,
        code,
        requestId: "r-err",
      });
    },
  );

  test.each([
    ["turn_in_progress", 2],
    ["session_conflict", null],
    ["turn_indeterminate", null],
  ])(
    "an error event %s is a 409; only turn_in_progress gets the fixed 2s wait",
    async (code, retryAfter) => {
      const head = normal.slice(0, 3);
      const error = {
        event: "error",
        data: { code, message: "충돌", request_id: "r-409" },
      };
      const fetchMock = stubFetch(sseResponse([encode([...head, error])]));
      await expect(collect(httpApi.searchStream("q"))).rejects.toMatchObject({
        status: 409,
        code,
        retryAfter,
        requestId: "r-409",
      });
      // 409 는 끊김이 아니므로 스트림을 다시 열지 않는다.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  test("a stream that closes without done is a cut", async () => {
    stubFetch(sseResponse([encode(normal.slice(0, -1))]));
    await expect(collect(httpApi.searchStream("q"))).rejects.toBeInstanceOf(
      StreamCutError,
    );
  });

  test("a read failure in the middle of the stream is a cut", async () => {
    stubFetch(sseResponse(split(encode(normal.slice(0, 4)), 40), true));
    await expect(collect(httpApi.searchStream("q"))).rejects.toBeInstanceOf(
      StreamCutError,
    );
  });

  test("an abort is passed through as AbortError, not as a cut", async () => {
    stubFetch({ fails: new DOMException("aborted", "AbortError") });
    await expect(collect(httpApi.searchStream("q"))).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  const brokenOrders: [string, StreamFixtureEvent[], string[]][] = [
    ["does not start with start", normal.slice(1), []],
    [
      "sends answer_delta before results",
      [normal[0], normal[1], normal[3], normal[2], ...normal.slice(4)],
      ["start", "interpretation"],
    ],
    ["skips interpretation", [normal[0], ...normal.slice(2)], ["start"]],
  ];

  test.each(brokenOrders)(
    "a stream that %s fails as invalid_response without drawing the broken event",
    async (_, events, drawn) => {
      stubFetch(sseResponse([encode(events)]));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const seen: string[] = [];
      let error: unknown;
      try {
        for await (const event of httpApi.searchStream("q"))
          seen.push(event.event);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({ status: 200, code: "invalid_response" });
      expect(seen).toEqual(drawn);
    },
  );

  test("an event with a wrong schema fails as invalid_response", async () => {
    const broken = structuredClone(normal);
    broken[3] = { event: "answer_delta", data: { index: 0 } };
    stubFetch(sseResponse([encode(broken)]));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(collect(httpApi.searchStream("q"))).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("mock stream", () => {
  test("every mock event bundle passes the stream validator", async () => {
    const api = createMockApi(0);
    for (const question of [
      "순자산 큰 국내 ETF",
      "모델 없이 순위",
      "국내 ETF 과거 추이",
      "채권 표면금리 높은 순",
      "추천해줘",
      "오류 내줘",
      "좋은 ETF",
    ]) {
      const events = await collect(api.searchStream(question));
      expect(() => validateStream(events), question).not.toThrow();
    }
  });

  test("the whole-deadline question sends the table first and then fails as a timeout", async () => {
    const events: StreamEvent[] = [];
    let error: unknown;
    try {
      for await (const e of createMockApi(0).searchStream("전체 시한 초과"))
        events.push(e);
    } catch (caught) {
      error = caught;
    }
    expect(events.map((e) => e.event)).toEqual([
      "start",
      "interpretation",
      "results",
    ]);
    expect(error).toMatchObject({ status: 504, code: "timeout" });
  });
});

describe("stream view", () => {
  test("applies events in order and clears the cut answer at the next start", () => {
    const normal = STREAM_FIXTURES.answered as unknown as StreamEvent[];
    let view: StreamView = emptyView();
    for (const event of normal.slice(0, 5)) view = applyEvent(view, event);
    expect(view.sentences).toHaveLength(2);
    expect(streamPhase(view)).toBe("answer");
    const restarted = applyEvent(view, normal[0]);
    expect(restarted.sentences).toEqual([]);
    expect(restarted.answer).toBeNull();
    expect(restarted.results).not.toBeNull();
  });

  test("results keep rows and product nodes uncited until done confirms them", () => {
    const normal = STREAM_FIXTURES.answered as unknown as StreamEvent[];
    let view = emptyView();
    expect(provisionalResponse(view, "q")).toBeNull();
    for (const event of normal.slice(0, 4)) view = applyEvent(view, event);
    const provisional = provisionalResponse(view, "q")!;
    expect(provisional.trace).toBeNull();
    expect(provisional.answer.text).toBe(view.sentences.join(" "));
    expect(
      provisional.interpretation.graph.nodes
        .filter((node) => node.kind === "product")
        .every((node) => !node.cited),
    ).toBe(true);
    expect(
      provisional.results.every((group) =>
        group.rows.every((row) => !row.cited),
      ),
    ).toBe(true);

    const finished = normal.at(-1);
    expect(finished?.event).toBe("done");
    if (finished?.event !== "done") throw new Error("done fixture missing");
    expect(
      finished.data.response.results.some((group) =>
        group.rows.some((row) => row.cited),
      ),
    ).toBe(true);
  });
});

describe("runSearchStream", () => {
  const normalEvents = STREAM_FIXTURES.answered as unknown as StreamEvent[];

  /** 시도마다 정해 둔 동작을 하는 가짜 API. */
  function fakeApi(
    attempts: Array<() => AsyncGenerator<StreamEvent, void, undefined>>,
    search?: SearchApi["search"],
  ): SearchApi & { calls: number } {
    const api = {
      calls: 0,
      searchStream: vi.fn(() => {
        const make = attempts[Math.min(api.calls, attempts.length - 1)];
        api.calls += 1;
        return make();
      }),
      search: search ?? vi.fn(() => Promise.reject(new Error("unused"))),
      getProduct: vi.fn(),
      getMeta: vi.fn(),
    };
    return api as unknown as SearchApi & { calls: number };
  }

  async function* full(): AsyncGenerator<StreamEvent, void, undefined> {
    yield* normalEvents;
  }

  async function* cutAfterFirstSentence(): AsyncGenerator<
    StreamEvent,
    void,
    undefined
  > {
    yield* normalEvents.slice(0, 4);
    throw new StreamCutError();
  }

  test("runs a normal stream to the done response", async () => {
    const api = fakeApi([full]);
    const views: StreamView[] = [];
    const response = await runSearchStream(
      api,
      "q",
      new AbortController().signal,
      (view) => views.push(view),
    );
    expect(response).toEqual({
      kind: "response",
      response: (normalEvents.at(-1) as { data: { response: unknown } }).data
        .response,
    });
    expect(api.calls).toBe(1);
    expect(views.at(-1)?.sentences).toHaveLength(2);
  });

  test("retries once after a cut, waiting at least one second and clearing the cut answer", async () => {
    vi.useFakeTimers();
    const api = fakeApi([cutAfterFirstSentence, full]);
    const views: StreamView[] = [];
    const promise = runSearchStream(
      api,
      "q",
      new AbortController().signal,
      (view) => views.push(view),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(api.calls).toBe(1);
    expect(views.at(-1)).toMatchObject({
      retrying: true,
      sentences: [],
      answer: null,
    });
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1);
    expect(api.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBeTruthy();
    expect(api.calls).toBe(2);
    expect(RETRY_DELAY_MS).toBeGreaterThanOrEqual(1000);
    // 재시도 뒤 문장은 새 스트림의 것만이다(앞 시도의 한 문장이 섞이지 않는다).
    expect(views.at(-1)?.sentences).toHaveLength(2);
    expect(views.at(-1)?.retrying).toBe(false);
  });

  test("fails with a connection error when the retry is cut too, with no third attempt", async () => {
    vi.useFakeTimers();
    const api = fakeApi([cutAfterFirstSentence]);
    const promise = runSearchStream(
      api,
      "q",
      new AbortController().signal,
      () => undefined,
    );
    const settled = promise.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 5);
    const error = await settled;
    expect(error).toMatchObject({ status: 0, code: "network" });
    expect(api.calls).toBe(2);
  });

  test("a stream that ends without done is treated as a cut, not as success", async () => {
    vi.useFakeTimers();
    async function* noDone(): AsyncGenerator<StreamEvent, void, undefined> {
      yield* normalEvents.slice(0, -1);
    }
    const api = fakeApi([noDone]);
    const settled = runSearchStream(
      api,
      "q",
      new AbortController().signal,
      () => undefined,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 5);
    expect(await settled).toMatchObject({ status: 0, code: "network" });
    expect(api.calls).toBe(2);
  });

  test("does not retry an error event or an invalid stream", async () => {
    async function* timeout(): AsyncGenerator<StreamEvent, void, undefined> {
      yield normalEvents[0];
      throw new ApiError(504, "timeout", null, "r-1");
    }
    const api = fakeApi([timeout]);
    await expect(
      runSearchStream(api, "q", new AbortController().signal, () => undefined),
    ).rejects.toMatchObject({ status: 504 });
    expect(api.calls).toBe(1);
  });

  test("falls back to the plain search once when the stream is unavailable", async () => {
    // eslint-disable-next-line require-yield
    async function* unavailable(): AsyncGenerator<
      StreamEvent,
      void,
      undefined
    > {
      throw new StreamUnavailableError();
    }
    const search = vi.fn().mockResolvedValue(answered);
    const api = fakeApi([unavailable], search);
    const response = await runSearchStream(
      api,
      "q",
      new AbortController().signal,
      () => undefined,
    );
    expect(response).toEqual({ kind: "response", response: answered });
    expect(search).toHaveBeenCalledTimes(1);
    expect(api.calls).toBe(1);
  });

  test("does not fall back for 422 or 429 errors before opening", async () => {
    // eslint-disable-next-line require-yield
    async function* limited(): AsyncGenerator<StreamEvent, void, undefined> {
      throw new ApiError(429, "rate_limited", 12);
    }
    const search = vi.fn();
    const api = fakeApi([limited], search);
    await expect(
      runSearchStream(api, "q", new AbortController().signal, () => undefined),
    ).rejects.toMatchObject({ status: 429 });
    expect(search).not.toHaveBeenCalled();
  });

  describe("기준 확인 대기", () => {
    const confirmation = confirmationRequired;

    async function* confirmationStream(): AsyncGenerator<
      StreamEvent,
      void,
      undefined
    > {
      yield normalEvents[0];
      yield { event: "confirmation_required", data: confirmation };
    }

    test("confirmation_required 는 정상 종료라서 다시 요청하지 않고 결과를 확인 대기로 돌려준다", async () => {
      const api = fakeApi([confirmationStream]);
      const result = await runSearchStream(
        api,
        "q",
        new AbortController().signal,
        () => undefined,
        undefined,
        "run-key-1",
      );
      expect(result).toEqual({ kind: "confirmation", confirmation });
      expect(api.calls).toBe(1);
      expect(api.search).not.toHaveBeenCalled();
    });

    test("끊김 재시도와 JSON 대체는 같은 실행 키를 쓴다", async () => {
      vi.useFakeTimers();
      const search = vi.fn().mockResolvedValue({
        kind: "confirmation_required",
        confirmation,
      });
      async function* unavailable(): AsyncGenerator<
        StreamEvent,
        void,
        undefined
      > {
        yield* [] as StreamEvent[];
        throw new StreamUnavailableError();
      }
      const api = fakeApi([cutAfterFirstSentence, unavailable], search);
      const promise = runSearchStream(
        api,
        "q",
        new AbortController().signal,
        () => undefined,
        undefined,
        "run-key-2",
      );
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 2);
      // JSON 대체가 돌려준 확인 대기도 스트림 경로와 같은 모양으로 맞춰진다.
      expect(await promise).toEqual({ kind: "confirmation", confirmation });
      const streamKeys = vi
        .mocked(api.searchStream)
        .mock.calls.map((call) => (call as unknown[])[2]);
      expect(streamKeys).toEqual(["run-key-2", "run-key-2"]);
      expect(search.mock.calls[0][2]).toBe("run-key-2");
    });
  });

  test("aborting during the retry wait stops without a second request", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const api = fakeApi([cutAfterFirstSentence, full]);
    const settled = runSearchStream(
      api,
      "q",
      controller.signal,
      () => undefined,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 3);
    expect(await settled).toMatchObject({ name: "AbortError" });
    expect(api.calls).toBe(1);
  });

  test("aborting while streaming does not retry", async () => {
    const controller = new AbortController();
    async function* aborting(): AsyncGenerator<StreamEvent, void, undefined> {
      yield normalEvents[0];
      controller.abort();
      throw new StreamCutError();
    }
    const api = fakeApi([aborting, full]);
    await expect(
      runSearchStream(api, "q", controller.signal, () => undefined),
    ).rejects.toBeInstanceOf(StreamCutError);
    expect(api.calls).toBe(1);
  });
});
