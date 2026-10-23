import {
  ambiguous,
  answered,
  bond,
  caveat,
  count,
  explainFixtureFor,
  errorOutcome,
  fallback,
  meta,
  noResult,
  notCollected,
  unread,
  PRODUCT_FIXTURES,
  refused,
  STREAM_FIXTURES,
  streamEventsFor,
  unavailable,
} from "./fixtures";
import { createMockConfirmSessions } from "./mockConfirm";
import {
  ApiError,
  StreamCutError,
  StreamUnavailableError,
  type SearchApi,
  type SearchResponse,
  type SearchResult,
  type StreamEvent,
} from "./types";
import { validateStreamEvent } from "./validate";

/**
 * 로컬 개발용 mock API. `VITE_API_MODE=mock`을 명시했을 때만 쓴다(client.ts).
 * 운영 번들에는 들어가지 않는다 — client.ts의 조건이 빌드 때 상수로 접혀 이 모듈이 빠진다.
 *
 * 질문 낱말로 픽스처를 고른다. 화면 상태를 손으로 확인하기 위한 것이라 규칙은 단순하다.
 *   "429" / "504" / "500"     → HTTP 오류
 *   "오류"                    → outcome error
 *   "모델"                    → generated_by fallback
 *   그 밖은 아래 RULES 순서
 *
 * 스트림(searchStream)은 같은 규칙으로 고른 응답을 이벤트로 나눠 시간차로 흘린다. 질문 낱말로 장애를 고른다.
 *   "전체 시한"               → 결과 뒤 error(timeout) 이벤트
 *   "계속 끊김"               → 문장 하나를 보낸 뒤 매번 연결이 끊김(재시도해도 끊김)
 *   "끊김"                    → 첫 요청만 문장 하나를 보낸 뒤 끊김, 재시도는 정상
 *   "스트림 불가"             → 스트림을 쓸 수 없어 일반 검색으로 대신함
 *   "미리보기 없음"           → 해석 미리보기(interpretation_draft) 없이 보냄(서버 플래그가 꺼진 경우)
 */
const RULES: Array<[RegExp, SearchResponse]> = [
  [/추천|오를|전망|사도 돼/, refused],
  [/편입|구성종목/, unavailable],
  [/과거|추이|이력|호가|시세/, notCollected],
  [/공부 중인데/, unread],
  [/좋은|괜찮은/, ambiguous],
  [/0\.01%|50%/, noResult],
  [/몇 ?개/, count],
  [/퇴직연금|ETN/, caveat],
  [/채권|AA|표면금리/, bond],
];

function pick(question: string): SearchResponse {
  if (/오류/.test(question)) return errorOutcome;
  if (/모델/.test(question)) return fallback;
  for (const [pattern, fixture] of RULES)
    if (pattern.test(question)) return fixture;
  return answered;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

/** 열기 전에 나는 HTTP 오류(질문 낱말로 고른다). search와 searchStream이 같이 쓴다. */
async function failBeforeOpen(
  question: string,
  delayScale: number,
  signal?: AbortSignal,
): Promise<void> {
  if (/429/.test(question)) {
    await wait(150 * delayScale, signal);
    throw new ApiError(429, "rate_limited", 12);
  }
  if (/504/.test(question)) {
    await wait(600 * delayScale, signal);
    throw new ApiError(504, "timeout");
  }
  if (/500/.test(question)) {
    await wait(150 * delayScale, signal);
    throw new ApiError(500, "http_500");
  }
}

/** 이벤트 앞에서 기다리는 시간(ms). 해석 → 표 → 문장 순서로 느껴지게 둔다. */
const EVENT_DELAY_MS: Record<string, number> = {
  interpretation_draft: 500,
  interpretation: 250,
  results: 350,
  answer_delta: 600,
  answer_done: 150,
  suggestions: 200,
  done: 50,
};

/**
 * 해석 미리보기(draft)가 있을 때 마지막 draft 뒤에서 최종 해석까지 기다리는 시간(ms).
 * 실서버는 해석 모델이 끝나고 판정을 거칠 때까지 수 초 걸리므로, 개발 서버에서 미리보기가 보이게 길게 둔다.
 */
const FINAL_INTERPRETATION_AFTER_DRAFT_MS = 1800;

/** 테스트에서 지연을 0으로 둔다. */
export function createMockApi(delayScale = 1): SearchApi {
  /** 질문별로 "첫 요청만 끊김"을 한 번 보냈는지. */
  const cutOnce = new Set<string>();
  const confirmSessions = createMockConfirmSessions();

  async function* stream(
    question: string,
    signal?: AbortSignal,
    runKey?: string,
  ): AsyncGenerator<StreamEvent, void, undefined> {
    await failBeforeOpen(question, delayScale, signal);
    if (/스트림 불가/.test(question)) throw new StreamUnavailableError();
    // 기준 확인이 필요한 질문은 start 뒤 confirmation_required 로 done 없이 정상 종료한다.
    const confirmation = confirmSessions.confirmationFor(question, runKey);
    if (confirmation) {
      await wait(EVENT_DELAY_MS.interpretation * delayScale, signal);
      yield validateStreamEvent("start", {
        request_id: "mock-confirm-start",
        question,
      });
      await wait(EVENT_DELAY_MS.results * delayScale, signal);
      yield validateStreamEvent("confirmation_required", confirmation);
      return;
    }
    const events = /전체 시한/.test(question)
      ? STREAM_FIXTURES.requestTimeout.map((item) =>
          item.event === "start"
            ? { ...item, data: { ...(item.data as object), question } }
            : item,
        )
      : streamEventsFor(
          { ...pick(question), question },
          !/미리보기 없음/.test(question),
        );
    const alwaysCut = /계속 끊김/.test(question);
    const firstCut = /끊김/.test(question) && !cutOnce.has(question);
    let mappings: unknown = [];
    let deltas = 0;
    let draftSeen = false;
    for (const item of structuredClone(events)) {
      draftSeen ||= item.event === "interpretation_draft";
      const delayMs =
        item.event === "interpretation" && draftSeen
          ? FINAL_INTERPRETATION_AFTER_DRAFT_MS
          : (EVENT_DELAY_MS[item.event] ?? 0);
      await wait(delayMs * delayScale, signal);
      const event = validateStreamEvent(item.event, item.data, mappings);
      if (event.event === "interpretation")
        mappings = event.data.interpretation.mappings;
      // 실서버 클라이언트(api.ts)와 같게 error 이벤트는 오류로 던진다.
      if (event.event === "error") {
        throw new ApiError(
          event.data.code === "timeout" ? 504 : 500,
          event.data.code,
          null,
          event.data.request_id,
        );
      }
      yield event;
      if (event.event === "answer_delta") deltas += 1;
      // 문장 하나를 보낸 뒤 연결이 끊긴다. 서버가 done·error 없이 닫은 경우와 같다.
      if ((alwaysCut || firstCut) && deltas === 1) {
        cutOnce.add(question);
        throw new StreamCutError();
      }
    }
  }

  return {
    searchStream: (question, signal, runKey) =>
      stream(question, signal, runKey),

    async search(question, signal, runKey): Promise<SearchResult> {
      await failBeforeOpen(question, delayScale, signal);
      const confirmation = confirmSessions.confirmationFor(question, runKey);
      if (confirmation) {
        await wait(250 * delayScale, signal);
        return { kind: "confirmation_required", confirmation };
      }
      const fixture = pick(question);
      // 생성 경로는 수 초, 게이트 경로는 짧다. 실제 체감과 비슷하게 둔다.
      const generated = fixture.answer.generated_by === "llm";
      await wait((generated ? 1600 : 250) * delayScale, signal);
      return structuredClone({ ...fixture, question });
    },

    async confirm(request, signal) {
      await wait(400 * delayScale, signal);
      return confirmSessions.confirm(request);
    },

    async getProduct(domain, productId, signal) {
      await wait(200 * delayScale, signal);
      const found = PRODUCT_FIXTURES.find(
        (p) => p.domain === domain && p.product_id === productId,
      );
      if (!found) throw new ApiError(404, "product_not_found");
      return structuredClone(found);
    },

    async getMeta(signal) {
      await wait(100 * delayScale, signal);
      return structuredClone(meta);
    },

    async explain(body, signal) {
      await wait(150 * delayScale, signal);
      return explainFixtureFor(body);
    },
  };
}

export const mockApi = createMockApi();
