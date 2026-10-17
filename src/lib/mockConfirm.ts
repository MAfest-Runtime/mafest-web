import { answered } from "./fixtures";
import {
  ApiError,
  type ConfirmationRequired,
  type ConfirmRequest,
  type SearchResponse,
} from "./types";

/*
 * 기준 확인(멀티턴)의 합성 mock. mockApi 안에서만 쓴다(`VITE_API_MODE=mock`). 운영 번들에는 들어가지 않는다.
 * 실제 서버 동작이 아니라 화면 확인용 흉내다 — 실서버·실DB·실LLM을 확인한 것이 아니다.
 *
 * 질문 낱말로 동작을 고른다.
 *   질문에 "안전"           → 검색 대신 확인 대기를 돌려준다(그 밖의 질문은 바로 검색)
 *   답변 "전송실패"          → 첫 제출만 연결 오류(서버는 처리함). 같은 키로 다시 보내면 처음 결과를 재생한다.
 *   답변 "처리중"            → 첫 제출은 409 turn_in_progress. 같은 키로 다시 보내면 처음 결과를 준다.
 *   답변 "충돌" / "만료" / "미지원" → 409 session_conflict / 410 session_expired / 501 confirm_unsupported
 */
const SESSION_TTL_MS = 10 * 60 * 1000;
const IN_PROGRESS_RETRY_AFTER_S = 2;

function randomToken(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMockConfirmSessions() {
  // 실행 키별 확인 응답. 같은 실행(스트림 재시도·JSON 대체)에는 같은 세션을 재생한다.
  const confirmationByRun = new Map<string, ConfirmationRequired>();
  // 세션이 어떤 원 질문·버전에서 시작됐는지. 서버가 세션에 보관하는 값을 흉내 낸다.
  const sessions = new Map<string, { question: string; version: number }>();
  // 제출 키별 처리 결과(중복 제출 재생)와 한 번만 내는 실패.
  const processed = new Map<string, SearchResponse>();
  const failedOnce = new Set<string>();

  return {
    /** 확인이 필요한 질문이면 확인 대기를, 아니면 null. */
    confirmationFor(
      question: string,
      runKey: string | undefined,
    ): ConfirmationRequired | null {
      if (!question.includes("안전")) return null;
      const replay = runKey ? confirmationByRun.get(runKey) : undefined;
      if (replay) return structuredClone(replay);
      const confirmation: ConfirmationRequired = {
        original_question: question,
        understood_conditions: ["국내 ETF", "5개"],
        pending_criterion: { id: "safety", label: "안전" },
        prompt: "안전하다는 기준은 어떤 뜻인가요?",
        actions: ["answer_text"],
        answer_max_length: 100,
        session: {
          id: randomToken("mock-session"),
          secret: randomToken("mock-secret"),
          version: 1,
          expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        },
      };
      sessions.set(confirmation.session.id, { question, version: 1 });
      if (runKey) confirmationByRun.set(runKey, confirmation);
      return structuredClone(confirmation);
    },

    /** 확인 답변을 처리한다. 오류는 계약의 ApiError 로 던진다. */
    confirm(request: ConfirmRequest): SearchResponse {
      const replay = processed.get(request.idempotencyKey);
      if (replay) return structuredClone(replay);
      const session = sessions.get(request.sessionId);
      if (!session) throw new ApiError(410, "session_expired");
      const { answer } = request;
      if (answer.includes("만료")) throw new ApiError(410, "session_expired");
      if (answer.includes("미지원"))
        throw new ApiError(501, "confirm_unsupported");
      if (answer.includes("충돌") || session.version !== request.version)
        throw new ApiError(409, "session_conflict");
      const response: SearchResponse = {
        ...structuredClone(answered),
        question: session.question,
      };
      if (
        answer.includes("처리중") &&
        !failedOnce.has(request.idempotencyKey)
      ) {
        failedOnce.add(request.idempotencyKey);
        processed.set(request.idempotencyKey, response);
        throw new ApiError(409, "turn_in_progress", IN_PROGRESS_RETRY_AFTER_S);
      }
      processed.set(request.idempotencyKey, response);
      // 서버는 처리했지만 응답이 오는 길에 끊긴 경우. 웹은 처리 여부를 알 수 없다.
      if (
        answer.includes("전송실패") &&
        !failedOnce.has(request.idempotencyKey)
      ) {
        failedOnce.add(request.idempotencyKey);
        throw new ApiError(0, "network");
      }
      return structuredClone(response);
    },
  };
}
