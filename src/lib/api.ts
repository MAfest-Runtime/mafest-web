import { parseSse } from "./sse";
import {
  ApiError,
  StreamCutError,
  StreamUnavailableError,
  type ConfirmRequest,
  type ErrorBody,
  type SearchApi,
  type SearchResponse,
  type StreamEvent,
  IN_PROGRESS_RETRY_SECONDS,
} from "./types";
import {
  ContractError,
  validateErrorBody,
  validateExplainResponse,
  validateMeta,
  validateProductDetail,
  validateSearchResponse,
  validateSearchResult,
  validateStream,
  validateStreamEvent,
} from "./validate";

/**
 * 실제 API 클라이언트. 같은 origin의 `/v1`을 부른다(Traefik이 mafest-api로 보낸다).
 * 로그인이 없으므로 인증 헤더를 보내지 않는다.
 *
 * 실패 처리 원칙:
 * - 429는 Traefik IP 요청 제한이다. Retry-After(초)를 읽어 ApiError에 담고
 *   화면이 카운트다운한다. 본문 형식이나 request_id는 기대하지 않는다.
 * - 그 밖 4xx·5xx는 본문이 ErrorBody면 그 code와 request_id를 쓴다. ErrorBody가 아니면
 *   본문의 다른 키(FastAPI `detail` 등)를 code로 믿지 않고 `http_<status>`로 둔다.
 * - 5xx라도 본문이 계약을 지키는 `outcome: "error"` 응답이면 그대로 돌려준다.
 *   서버가 error를 200으로 줄지 500으로 줄지(37 두 문서의 차이) 웹은 상관하지 않는다.
 * - 본문이 계약과 다르면 성공처럼 그리지 않고 invalid_response로 실패시킨다.
 */

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** 본문이 계약을 지킨 앱 오류 본문이면 돌려주고, 아니면(Traefik 본문 등) null. */
function appErrorBody(body: unknown): ErrorBody | null {
  try {
    return validateErrorBody(body);
  } catch (error) {
    if (error instanceof ContractError) return null;
    throw error;
  }
}

/** 최초 검색 실행 키가 있으면 Idempotency-Key 헤더로 보낸다. */
function runKeyHeader(runKey: string | undefined): Record<string, string> {
  return runKey === undefined ? {} : { "Idempotency-Key": runKey };
}

async function request(
  path: string,
  init: RequestInit,
): Promise<{ response: Response; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch (error) {
    // 사용자가 새 검색으로 이전 요청을 끊은 경우는 오류 화면을 그리지 않는다.
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(0, "network");
  }
  return { response, body: await readJson(response) };
}

function fail(response: Response, body: unknown): never {
  const appError = appErrorBody(body);
  // Traefik 응답에는 X-Request-Id가 없을 수 있다. 본문 request_id를 먼저 쓴다.
  const requestId =
    appError?.request_id ?? response.headers.get("X-Request-Id");
  if (response.status === 429) {
    throw new ApiError(
      429,
      "rate_limited",
      parseRetryAfter(response.headers.get("Retry-After")),
      requestId,
    );
  }
  // Traefik이 직접 낸 504는 ErrorBody가 아닐 수 있지만 화면 의미는 같다.
  if (response.status === 504)
    throw new ApiError(504, "timeout", null, requestId);
  // 409 turn_in_progress 는 Retry-After(초) 뒤에 같은 키로 수동 재전송하라는 뜻이다.
  // 헤더가 빠진 turn_in_progress 는 계약의 고정 대기를 쓴다. 다른 409 에는 대기 개념이 없다.
  const retryAfter =
    response.status !== 409
      ? null
      : (parseRetryAfter(response.headers.get("Retry-After")) ??
        (appError?.code === "turn_in_progress"
          ? IN_PROGRESS_RETRY_SECONDS
          : null));
  throw new ApiError(
    response.status,
    appError?.code ?? `http_${response.status}`,
    retryAfter,
    requestId,
  );
}

function checked<T>(validate: (input: unknown) => T, body: unknown): T {
  try {
    return validate(body);
  } catch (error) {
    if (error instanceof ContractError) {
      // 어느 필드가 어긋났는지는 개발자 도구에서 볼 수 있게 남긴다(값은 남기지 않는다).
      console.error(error.message);
      throw new ApiError(200, "invalid_response");
    }
    throw error;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * 지금까지 받은 이벤트의 순서를 기존 validateStream으로 본다. 진행 중인 스트림은 아직 done·error로 끝나지
 * 않아 마지막 검사(경로 "stream")만 실패하는데, 그것은 정상이므로 넘긴다. 그 밖의 경로는 계약 위반이다.
 */
function assertOrder(
  received: ReadonlyArray<{ event: unknown; data: unknown }>,
) {
  try {
    validateStream(received);
  } catch (error) {
    if (error instanceof ContractError && error.path === "stream") return;
    throw error;
  }
}

/** 스트림을 열기 전 응답이 "스트림을 못 쓴다"는 뜻인가. 422·429·504는 화면 오류 규칙을 그대로 따른다. */
function streamUnavailable(status: number): boolean {
  return status === 404 || (status >= 500 && status !== 504);
}

/**
 * SSE error 이벤트를 HTTP 와 같은 ApiError 로 옮긴다. 이벤트에는 상태 코드와 헤더가 없으므로 code 로 정한다.
 * 409 세 가지는 409 의미로, timeout 은 504, 그 밖은 500 이다. 모르는 code 를 "처리 중"으로 추측하지 않는다.
 */
function streamError(body: ErrorBody): ApiError {
  switch (body.code) {
    case "turn_in_progress":
      return new ApiError(
        409,
        body.code,
        IN_PROGRESS_RETRY_SECONDS,
        body.request_id,
      );
    case "session_conflict":
    case "turn_indeterminate":
      return new ApiError(409, body.code, null, body.request_id);
    case "timeout":
      return new ApiError(504, body.code, null, body.request_id);
    default:
      return new ApiError(500, body.code, null, body.request_id);
  }
}

async function* openStream(
  question: string,
  signal: AbortSignal | undefined,
  runKey: string | undefined,
): AsyncGenerator<StreamEvent, void, undefined> {
  let response: Response;
  try {
    response = await fetch("/v1/search/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...runKeyHeader(runKey),
      },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    // 열기 전 연결 실패는 비스트림 경로가 같은 서버에 한 번 더 물어 본다.
    throw new StreamUnavailableError();
  }
  if (!response.ok) {
    const body = await readJson(response);
    if (streamUnavailable(response.status)) throw new StreamUnavailableError();
    fail(response, body);
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  if (
    !contentType.toLowerCase().includes("text/event-stream") ||
    !response.body
  )
    throw new StreamUnavailableError();

  const received: Array<{ event: unknown; data: unknown }> = [];
  let mappings: unknown = [];
  try {
    for await (const raw of parseSse(response.body)) {
      received.push(raw);
      assertOrder(received);
      const event = validateStreamEvent(raw.event, raw.data, mappings);
      if (event.event === "interpretation")
        mappings = event.data.interpretation.mappings;
      if (event.event === "error") throw streamError(event.data);
      if (event.event === "done" || event.event === "confirmation_required") {
        // confirmation_required 도 done 처럼 스트림의 정상 종료다. 끊김으로 보면 자동 재시도가 같은 질문을
        // 다시 해석하게 된다.
        yield event;
        // 서버가 소켓을 늦게 닫아도 화면 확정을 기다리지 않는다. return으로 안쪽
        // parseSse 반복을 닫으면 그 finally가 reader.cancel()을 수행한다.
        return;
      }
      yield event;
    }
  } catch (error) {
    if (error instanceof ContractError) {
      console.error(error.message);
      throw new ApiError(200, "invalid_response");
    }
    if (error instanceof ApiError || isAbort(error)) throw error;
    // 본문을 읽던 중 연결이 끊김. 끊긴 이벤트는 파서가 이미 버렸다.
    throw new StreamCutError();
  }
  throw new StreamCutError();
}

/**
 * 5xx(504 제외) 응답 본문이 계약을 지킨 SearchResponse(outcome="error")이면 돌려주고, 아니면 null.
 * 이것을 받아도 서버가 DB에 저장까지 마쳤다는 뜻은 아니다.
 */
function validErrorOutcome(
  status: number,
  body: unknown,
): SearchResponse | null {
  if (status < 500 || status === 504) return null;
  try {
    const parsed = validateSearchResponse(body);
    return parsed.outcome === "error" ? parsed : null;
  } catch {
    // 계약 밖 본문이면 호출한 쪽이 일반 HTTP 오류(처리 결과 불명)로 처리한다.
    return null;
  }
}

export const httpApi: SearchApi = {
  searchStream(question, signal, runKey) {
    return openStream(question, signal, runKey);
  },

  async search(question, signal, runKey) {
    const { response, body } = await request("/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runKeyHeader(runKey) },
      body: JSON.stringify({ question }),
      signal,
    });
    if (!response.ok) {
      // 계약을 지킨 error 응답이면 request_id와 trace를 살려 그대로 보여준다.
      const errorResult = validErrorOutcome(response.status, body);
      if (errorResult) return errorResult;
      fail(response, body);
    }
    return checked(validateSearchResult, body);
  },

  async confirm(submission: ConfirmRequest, signal) {
    // 세션 secret 은 헤더로만, 본문에는 세션 id·버전·동작·답만 보낸다. 내부 계획·읽은 조건은 보내지 않는다.
    const { response, body } = await request("/v1/search/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": submission.idempotencyKey,
        "X-Session-Secret": submission.secret,
      },
      body: JSON.stringify({
        session_id: submission.sessionId,
        version: submission.version,
        action: submission.action,
        answer: submission.answer,
      }),
      signal,
    });
    if (!response.ok) {
      // 최초 검색과 같은 원칙: 계약 검증을 통과한 outcome="error" 본문만 확정된 오류 결과로 받는다.
      // 504·일반 5xx·계약 밖 본문은 fail() 로 가서 처리 결과 불명이 된다.
      const errorResult = validErrorOutcome(response.status, body);
      if (errorResult) return errorResult;
      fail(response, body);
    }
    return checked(validateSearchResponse, body);
  },

  async getProduct(domain, productId, signal) {
    const path = `/v1/products/${encodeURIComponent(domain)}/${encodeURIComponent(productId)}`;
    const { response, body } = await request(path, { signal });
    if (!response.ok) fail(response, body);
    return checked(validateProductDetail, body);
  },

  async getMeta(signal) {
    const { response, body } = await request("/v1/meta", { signal });
    if (!response.ok) fail(response, body);
    return checked(validateMeta, body);
  },

  async explain(body, signal) {
    const { response, body: payload } = await request("/v1/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) fail(response, payload);
    return checked(validateExplainResponse, payload);
  },
};
