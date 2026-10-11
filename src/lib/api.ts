import { parseSse } from "./sse";
import {
  ApiError,
  StreamCutError,
  StreamUnavailableError,
  type ErrorBody,
  type SearchApi,
  type StreamEvent,
} from "./types";
import {
  ContractError,
  validateErrorBody,
  validateExplainResponse,
  validateMeta,
  validateProductDetail,
  validateSearchResponse,
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
  throw new ApiError(
    response.status,
    appError?.code ?? `http_${response.status}`,
    null,
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

async function* openStream(
  question: string,
  signal: AbortSignal | undefined,
): AsyncGenerator<StreamEvent, void, undefined> {
  let response: Response;
  try {
    response = await fetch("/v1/search/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
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
      if (event.event === "error") {
        throw new ApiError(
          event.data.code === "timeout" ? 504 : 500,
          event.data.code,
          null,
          event.data.request_id,
        );
      }
      if (event.event === "done") {
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

export const httpApi: SearchApi = {
  searchStream(question, signal) {
    return openStream(question, signal);
  },

  async search(question, signal) {
    const { response, body } = await request("/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal,
    });
    if (!response.ok) {
      if (response.status >= 500 && response.status !== 504) {
        // 계약을 지킨 error 응답이면 request_id와 trace를 살려 그대로 보여준다.
        try {
          const parsed = validateSearchResponse(body);
          if (parsed.outcome === "error") return parsed;
        } catch {
          // 계약 밖 본문이면 아래의 일반 HTTP 오류로 처리한다.
        }
      }
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
