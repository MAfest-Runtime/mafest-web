import { afterEach, describe, expect, test, vi } from "vitest";
import { httpApi } from "./api";
import {
  answered,
  CONCEPT_TOPICS,
  confirmationRequired,
  confirmationResponse,
  errorOutcome,
  meta,
  PRODUCT_FIXTURES,
} from "./fixtures";
import { ApiError, type SearchResponse } from "./types";

/*
 * 실제 api.ts + 가짜 fetch. 요청 형태와 실패 처리를 본다(서버 없음).
 */

function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Traefik 요청 제한처럼 JSON이 아닌 본문. */
function respondText(
  status: number,
  text: string,
  headers: Record<string, string> = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(text, {
        status,
        headers: { "Content-Type": "text/plain", ...headers },
      }),
    ),
  );
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("실패해야 하는데 성공했다");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("search", () => {
  test("같은 origin /v1/search에 질문만 JSON으로 보낸다(인증 헤더 없음)", async () => {
    const fetchMock = respond(200, answered);
    const result = (await httpApi.search(
      "순자산 큰 국내 ETF 5개",
    )) as SearchResponse;
    expect(result.outcome).toBe("answered");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/v1/search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      question: "순자산 큰 국내 ETF 5개",
    });
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  test("Edge 429(text/plain, X-Request-Id 없음)는 rate_limited, Retry-After는 쓴다", async () => {
    respondText(429, "Too Many Requests", { "Retry-After": "17" });
    const error = await failure(httpApi.search("q"));
    expect(error.status).toBe(429);
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfter).toBe(17);
    expect(error.requestId).toBeNull();
  });

  test("429 JSON이라도 앱 오류로 믿지 않고 rate_limited로 분류한다", async () => {
    respond(429, { code: "busy" });
    const error = await failure(httpApi.search("q"));
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfter).toBeNull();
  });

  test("FastAPI 기본 422(detail)는 code로 쓰지 않는다", async () => {
    respond(422, { detail: [{ msg: "field required" }] });
    const error = await failure(httpApi.search(""));
    expect(error.status).toBe(422);
    expect(error.code).toBe("http_422");
  });

  test("504는 timeout", async () => {
    respond(504, undefined);
    const error = await failure(httpApi.search("q"));
    expect(error.code).toBe("timeout");
  });

  test("500이라도 계약을 지킨 error 응답이면 그대로 돌려준다", async () => {
    respond(500, errorOutcome);
    const result = (await httpApi.search("q")) as SearchResponse;
    expect(result.outcome).toBe("error");
    expect(result.request_id).toBe(errorOutcome.request_id);
  });

  test("500 + 계약 밖 본문은 HTTP 오류", async () => {
    respond(
      500,
      { detail: "Internal Server Error" },
      { "X-Request-Id": "req-1" },
    );
    const error = await failure(httpApi.search("q"));
    expect(error.status).toBe(500);
    expect(error.requestId).toBe("req-1");
  });

  test("200이라도 계약을 어기면 성공으로 그리지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respond(200, { ...answered, outcome: "fine" });
    const error = await failure(httpApi.search("q"));
    expect(error.code).toBe("invalid_response");
  });

  test("연결 실패는 status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const error = await failure(httpApi.search("q"));
    expect(error.status).toBe(0);
    expect(error.code).toBe("network");
  });

  test("사용자가 끊은 요청은 ApiError로 바꾸지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    await expect(httpApi.search("q")).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("search · 최초 실행 키와 확인 대기", () => {
  test("실행 키는 Idempotency-Key 헤더로만 보낸다", async () => {
    const fetchMock = respond(200, answered);
    await httpApi.search("q", undefined, "run-key-abcdef-0001");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBe("run-key-abcdef-0001");
    expect(JSON.parse(init.body)).toEqual({ question: "q" });
  });

  test("확인 대기 응답은 오류나 성공 결과가 아니라 kind 로 구분해 돌려준다", async () => {
    respond(200, confirmationResponse);
    expect(await httpApi.search("q")).toEqual(confirmationResponse);
  });

  test("kind 가 있으면 SearchResponse 형식으로 섞어 통과시키지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    respond(200, { ...answered, kind: "confirmation_required" });
    expect(await failure(httpApi.search("q"))).toMatchObject({
      status: 200,
      code: "invalid_response",
    });
  });
});

describe("confirm", () => {
  const submission = {
    idempotencyKey: "submit-key-abcdef-0001",
    sessionId: confirmationRequired.session.id,
    secret: confirmationRequired.session.secret,
    version: confirmationRequired.session.version,
    action: "answer_text" as const,
    answer: "변동성이 낮은 것",
  };

  test("승인된 헤더와 본문 필드만 /v1/search/confirm 으로 보낸다", async () => {
    const fetchMock = respond(200, answered);
    await httpApi.confirm(submission);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/v1/search/confirm");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      session_id: submission.sessionId,
      version: 1,
      action: "answer_text",
      answer: "변동성이 낮은 것",
    });
    // 헤더: 키와 세션 secret 만 더한다(원 질문·읽은 조건·계획은 본문에도 없다).
    expect(init.headers["Idempotency-Key"]).toBe(submission.idempotencyKey);
    expect(init.headers["X-Session-Secret"]).toBe(submission.secret);
    expect(JSON.stringify(init.body)).not.toContain(submission.secret);
  });

  test("성공 응답은 검색 응답 검증을 거친다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    respond(200, { ...answered, results: "broken" });
    expect(await failure(httpApi.confirm(submission))).toMatchObject({
      status: 200,
      code: "invalid_response",
    });
  });

  test.each([
    [409, "turn_in_progress", { "Retry-After": "3" }, 3],
    [409, "session_conflict", {}, null],
    [410, "session_expired", {}, null],
    [501, "confirm_unsupported", {}, null],
  ])(
    "%i %s 는 code 와 Retry-After 를 담은 ApiError 다",
    async (status, code, headers, retryAfter) => {
      respond(
        status,
        { code, message: "x", request_id: "r-1" },
        headers as Record<string, string>,
      );
      expect(await failure(httpApi.confirm(submission))).toMatchObject({
        status,
        code,
        retryAfter,
      });
    },
  );

  test("연결 실패는 status 0 이다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    expect(await failure(httpApi.confirm(submission))).toMatchObject({
      status: 0,
      code: "network",
    });
  });
});

describe("products · meta", () => {
  test("상품 경로의 도메인·id를 인코딩한다", async () => {
    const fetchMock = respond(200, PRODUCT_FIXTURES[0]);
    await httpApi.getProduct("kr_etf", "A/B");
    expect(fetchMock.mock.calls[0][0]).toBe("/v1/products/kr_etf/A%2FB");
  });

  test("없는 상품은 404 ErrorBody의 code·request_id를 쓴다", async () => {
    respond(404, {
      code: "product_not_found",
      message: "상품이 없습니다.",
      request_id: "mock-404-0001",
    });
    const error = await failure(httpApi.getProduct("kr_etf", "NOPE"));
    expect(error.status).toBe(404);
    expect(error.code).toBe("product_not_found");
    expect(error.requestId).toBe("mock-404-0001");
  });

  test("필수 필드가 빠진 오류 본문은 ErrorBody로 믿지 않는다", async () => {
    respond(404, { code: "product_not_found" });
    const error = await failure(httpApi.getProduct("kr_etf", "NOPE"));
    expect(error.code).toBe("http_404");
  });

  test("meta", async () => {
    respond(200, meta);
    const result = await httpApi.getMeta();
    expect(result.examples.length).toBe(6);
  });

  test("meta의 예시가 4개여도 그대로 읽는다", async () => {
    const examples = meta.examples.slice(0, 4);
    respond(200, { ...meta, examples });

    const result = await httpApi.getMeta();

    expect(result.examples).toEqual(examples);
  });
});

describe("explain", () => {
  const body = { domains: ["kr_etf" as const], axes: [], sort_axis: "aum" };

  test("posts the applied domains, axes and sort axis as JSON to /v1/explain and reads the topics", async () => {
    const fetchMock = respond(200, { topics: [CONCEPT_TOPICS.aum] });

    const result = await httpApi.explain(body);

    expect(result.topics).toHaveLength(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/v1/explain");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(body);
    expect(Object.keys(init.headers)).not.toContain("Authorization");
  });

  test("turns a response that breaks the contract into an invalid_response error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respond(200, { topics: [{ ...CONCEPT_TOPICS.aum, extra: true }] });

    const error = await failure(httpApi.explain(body));

    expect(error.code).toBe("invalid_response");
  });

  test("maps 429 and 5xx to ApiError without reading a topic list", async () => {
    respondText(429, "Too Many Requests", { "Retry-After": "7" });
    const limited = await failure(httpApi.explain(body));
    expect(limited.status).toBe(429);
    expect(limited.retryAfter).toBe(7);

    respond(500, { code: "internal", message: "x", request_id: "r-1" });
    expect((await failure(httpApi.explain(body))).status).toBe(500);
  });
});

describe("최초 검색의 409", () => {
  const body = (code: string) => ({
    code,
    message: "충돌",
    request_id: "r-409",
  });

  test("turn_in_progress 는 Retry-After 를 담고, 헤더가 없으면 고정 2초를 쓴다", async () => {
    respond(409, body("turn_in_progress"), { "Retry-After": "3" });
    expect(await failure(httpApi.search("q", undefined, "k-1"))).toMatchObject({
      status: 409,
      code: "turn_in_progress",
      retryAfter: 3,
    });

    respond(409, body("turn_in_progress"));
    expect((await failure(httpApi.search("q"))).retryAfter).toBe(2);
  });

  test.each(["session_conflict", "turn_indeterminate"])(
    "%s 는 재전송 대기 없이 409 로 돌려준다",
    async (code) => {
      respond(409, body(code));
      expect(await failure(httpApi.search("q"))).toMatchObject({
        status: 409,
        code,
        retryAfter: null,
      });
    },
  );

  test("스트림을 열기 전 409 는 JSON 검색으로 새지 않고 그대로 던진다", async () => {
    const fetchMock = respond(409, body("turn_in_progress"), {
      "Retry-After": "2",
    });
    const stream = httpApi.searchStream("q", undefined, "k-1");
    const events = stream[Symbol.asyncIterator]();
    await expect(events.next()).rejects.toMatchObject({
      status: 409,
      code: "turn_in_progress",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
