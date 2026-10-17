import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  IN_PROGRESS_RETRY_SECONDS,
  type ConfirmationRequired,
  type ConfirmRequest,
  type SearchApi,
  type SearchResponse,
} from "./types";
import { ContractError, validateConfirmSubmitResponse } from "./validate";

/** 이 세션을 더 쓸 수 없는 이유. 화면 문구는 ConfirmEnded 가 고른다. */
export type EndReason =
  | "expired"
  | "conflict"
  | "indeterminate"
  | "unsupported"
  | "failed";

/**
 * 확인 답변 제출의 화면 상태.
 *
 * - awaiting: 사용자의 답을 기다린다.
 * - submitting: 답을 보내는 중. 입력·버튼을 잠근다.
 * - sendUnknown: 전송 결과를 모른다(서버가 처리했을 수도 있다). 사용자가 눌러야만 **처음 보낸 요청**을 같은 키로 다시 보낸다.
 * - inProgress: 같은 키의 요청을 서버가 아직 처리 중이다(409 turn_in_progress). Retry-After 뒤에 같은 키로 수동 재전송만 한다.
 * - resumed: 이어받은 검색 결과가 왔다.
 * - ended: 만료·충돌·미지원·응답 오류로 이 세션을 더 쓸 수 없다. 새 확인은 새 실행(새 키)으로 시작한다.
 */
export type ConfirmPhase =
  | { phase: "awaiting" }
  | { phase: "submitting"; request: ConfirmRequest }
  | { phase: "sendUnknown"; request: ConfirmRequest }
  | { phase: "inProgress"; request: ConfirmRequest; retryAfter: number | null }
  | { phase: "resumed"; response: SearchResponse }
  | { phase: "ended"; reason: EndReason };

type Failure =
  | { kind: "unknown" }
  | { kind: "inProgress"; retryAfter: number | null }
  | { kind: "ended"; reason: EndReason };

/**
 * 제출 실패를 "서버가 처리했는지 알 수 있는가"로 나눈다. 순서가 중요하다.
 * 1) 서버가 명시한 종료 사유(만료·충돌·미지원)와 응답 형식 오류는 재전송 대상이 아니다.
 *    501 미지원도 5xx 이지만 "처리하지 않았다"는 뜻이라 일반 5xx 보다 먼저 걸러야 한다.
 *    200 invalid_response 는 서버가 처리한 뒤 깨진 본문을 준 것이라 같은 요청을 다시 보내도 같다.
 * 2) 409 turn_in_progress 는 충돌과 다르다. 같은 키 요청이 처리 중이라는 뜻이다.
 * 3) 연결 오류·시간 초과·일반 5xx 는 처리 여부를 모른다 → 사용자가 누르면 같은 키로 다시 보낸다.
 * 4) 나머지 4xx 는 요청 자체가 거절된 것이라 다시 보내도 같다.
 */
function classifyFailure(error: unknown): Failure {
  if (error instanceof ContractError)
    return { kind: "ended", reason: "failed" };
  if (!(error instanceof ApiError)) return { kind: "ended", reason: "failed" };
  if (error.code === "turn_in_progress")
    return {
      kind: "inProgress",
      retryAfter: error.retryAfter ?? IN_PROGRESS_RETRY_SECONDS,
    };
  // turn_indeterminate 는 409 지만 충돌과 다르게 "결과를 알 수 없는 영구 종료"다. 일반 409 보다 먼저 가른다.
  if (error.code === "turn_indeterminate")
    return { kind: "ended", reason: "indeterminate" };
  if (error.code === "session_expired" || error.status === 410)
    return { kind: "ended", reason: "expired" };
  if (error.code === "session_conflict" || error.status === 409)
    return { kind: "ended", reason: "conflict" };
  if (error.code === "confirm_unsupported" || error.status === 501)
    return { kind: "ended", reason: "unsupported" };
  if (error.code === "invalid_response")
    return { kind: "ended", reason: "failed" };
  if (error.status >= 400 && error.status < 500)
    return { kind: "ended", reason: "failed" };
  return { kind: "unknown" };
}

/** 새 실행의 시작 상태. 렌더마다 새 객체를 만들면 콜백 의존성이 매번 바뀌므로 하나만 쓴다. */
const AWAITING: ConfirmPhase = { phase: "awaiting" };

interface Tagged {
  runId: number;
  phase: ConfirmPhase;
}

/**
 * 확인 대기(confirmation)에 사용자의 답을 보내 검색을 이어 받는다. 확인 대기를 받은 최초 검색 실행(runId)이
 * 바뀌면(질문 변경·다시 시도) 상태를 버리고 awaiting 으로 돌아간다.
 *
 * - 제출은 사용자의 클릭에서만 일어난다. effect 에서 보내지 않으므로 StrictMode 의 이중 실행·재마운트가
 *   제출을 늘리지 않는다. 같은 시점의 중복 클릭·Enter 반복은 `ownerRef` 가 막는다.
 * - 잠금의 주인은 요청마다 만든 토큰이다. 오래된 요청의 finally 는 자기 토큰일 때만 잠금을 풀기 때문에,
 *   abort 된 이전 요청이 뒤늦게 끝나도 그 사이 시작된 새 제출의 잠금을 풀지 않는다.
 * - 전송 결과를 모를 때 자동으로 다시 보내지 않는다. 사용자가 "다시 보내기"를 누르면 **처음 요청 그대로**(같은
 *   Idempotency-Key·세션·버전·답)를 보낸다. 답을 바꾸는 경로는 없다.
 * - 클라이언트 abort 는 서버 처리가 취소됐다는 뜻이 아니다. 늦게 온 응답만 버린다.
 * - 세션 secret 과 답은 이 상태에만 있다. URL·콘솔·저장소에 쓰지 않는다.
 */
export function useConfirmSubmit(
  runId: number | null,
  confirmation: ConfirmationRequired | null,
  api: SearchApi,
): {
  state: ConfirmPhase;
  submit: (answer: string) => void;
  resend: () => void;
} {
  const [tagged, setTagged] = useState<Tagged | null>(null);
  const apiRef = useRef(api);
  apiRef.current = api;
  const ownerRef = useRef<symbol | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // 실행이 바뀌거나 화면을 떠나면 진행 중인 제출을 끊고 잠금을 푼다.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      ownerRef.current = null;
    };
  }, [runId]);

  const send = useCallback(
    (request: ConfirmRequest) => {
      if (runId === null || confirmation === null) return;
      if (ownerRef.current !== null) return;
      const token = Symbol("confirm-submit");
      const controller = new AbortController();
      ownerRef.current = token;
      controllerRef.current = controller;
      setTagged({ runId, phase: { phase: "submitting", request } });
      apiRef.current
        .confirm(request, controller.signal)
        .then((response) =>
          validateConfirmSubmitResponse(
            response,
            confirmation.original_question,
          ),
        )
        .then((response) => {
          if (controller.signal.aborted) return;
          setTagged({ runId, phase: { phase: "resumed", response } });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const failure = classifyFailure(error);
          setTagged({
            runId,
            phase:
              failure.kind === "unknown"
                ? { phase: "sendUnknown", request }
                : failure.kind === "inProgress"
                  ? {
                      phase: "inProgress",
                      request,
                      retryAfter: failure.retryAfter,
                    }
                  : { phase: "ended", reason: failure.reason },
          });
        })
        .finally(() => {
          if (ownerRef.current === token) {
            ownerRef.current = null;
            controllerRef.current = null;
          }
        });
    },
    [runId, confirmation],
  );

  const state: ConfirmPhase =
    tagged !== null && tagged.runId === runId ? tagged.phase : AWAITING;

  const submit = useCallback(
    (answer: string) => {
      if (state.phase !== "awaiting" || confirmation === null) return;
      send({
        idempotencyKey: crypto.randomUUID(),
        sessionId: confirmation.session.id,
        secret: confirmation.session.secret,
        version: confirmation.session.version,
        action: "answer_text",
        answer,
      });
    },
    [state, confirmation, send],
  );

  const resend = useCallback(() => {
    if (state.phase !== "sendUnknown" && state.phase !== "inProgress") return;
    send(state.request);
  }, [state, send]);

  return { state, submit, resend };
}
