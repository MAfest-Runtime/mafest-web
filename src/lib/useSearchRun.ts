import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { emptyView, runSearchStream, type StreamView } from "./searchStream";
import {
  ApiError,
  IN_PROGRESS_RETRY_SECONDS,
  isSearchConflict,
  isSearchUnknown,
  type ConfirmationRequired,
  type ConfirmRequest,
  type ConfirmSession,
  type SearchApi,
  type SearchResponse,
} from "./types";
import { checkConfirmAnswer, validateConfirmSubmitResponse } from "./validate";

export type ConfirmForm = Pick<
  ConfirmationRequired,
  "original_question" | "understood_conditions" | "prompt" | "answer_max_length"
> & { canAnswer: boolean };

export type PendingRequestRecovery =
  | { kind: "inProgress"; retryAt: number }
  | { kind: "unknown" };

export type ConfirmPhase =
  | { phase: "awaiting" }
  | { phase: "submitting"; answer: string }
  | { phase: "pending"; answer: string; recovery: PendingRequestRecovery };

export type EndReason =
  | "expired"
  | "conflict"
  | "indeterminate"
  | "unsupported"
  | "failed";

type ConfirmFailure =
  | PendingRequestRecovery
  | { kind: "ended"; reason: EndReason };

export type InitialRecovery =
  | PendingRequestRecovery
  | { kind: "conflict" }
  | { kind: "failed"; canRestart: boolean };

export type RunState =
  | { status: "idle" }
  | { status: "streaming"; runId: number; startedAt: number; view: StreamView }
  | { status: "done"; runId: number; data: SearchResponse }
  | {
      status: "confirm";
      runId: number;
      confirmation: ConfirmForm;
      phase: ConfirmPhase;
    }
  | {
      status: "confirmEnded";
      runId: number;
      reason: EndReason;
      canRestart: boolean;
    }
  | {
      status: "failed";
      runId: number;
      error: ApiError;
      recovery: InitialRecovery;
    };

interface ActiveRun {
  id: number;
  question: string;
  requestKey: string;
  controller: AbortController;
  state: RunState;
  confirmation: {
    session: ConfirmSession;
    request: ConfirmRequest | null;
  } | null;
}

const IDLE: RunState = { status: "idle" };

function retryDeadline(retryAfter: number | null): number {
  return Date.now() + (retryAfter ?? IN_PROGRESS_RETRY_SECONDS) * 1_000;
}

function canResend(recovery: InitialRecovery): boolean {
  return (
    recovery.kind === "unknown" ||
    (recovery.kind === "inProgress" && Date.now() >= recovery.retryAt)
  );
}

function initialRecovery(error: ApiError): InitialRecovery {
  if (isSearchConflict(error)) {
    return error.code === "turn_in_progress"
      ? { kind: "inProgress", retryAt: retryDeadline(error.retryAfter) }
      : { kind: "conflict" };
  }
  if (isSearchUnknown(error)) return { kind: "unknown" };
  return {
    kind: "failed",
    canRestart: error.status !== 404 && error.status !== 422,
  };
}

function confirmFailure(error: unknown): ConfirmFailure {
  if (!(error instanceof ApiError)) return { kind: "ended", reason: "failed" };
  if (error.code === "turn_in_progress")
    return { kind: "inProgress", retryAt: retryDeadline(error.retryAfter) };
  // 같은 409라도 처리 결과 불명으로 영구 종료된 요청은 충돌 안내보다 먼저 가른다.
  if (error.code === "turn_indeterminate")
    return { kind: "ended", reason: "indeterminate" };
  if (error.code === "session_expired" || error.status === 410)
    return { kind: "ended", reason: "expired" };
  if (error.code === "session_conflict" || error.status === 409)
    return { kind: "ended", reason: "conflict" };
  // 미지원(501)과 검증 실패는 같은 요청을 재전송해도 고칠 수 없다.
  if (error.code === "confirm_unsupported" || error.status === 501)
    return { kind: "ended", reason: "unsupported" };
  if (
    error.code === "invalid_response" ||
    (error.status >= 400 && error.status < 500)
  )
    return { kind: "ended", reason: "failed" };
  return { kind: "unknown" };
}

/** 화면에 필요한 필드만 복사해서 세션과 재전송 요청을 실행 밖으로 전달하지 않는다. */
function confirmForm(confirmation: ConfirmationRequired): ConfirmForm {
  return {
    original_question: confirmation.original_question,
    understood_conditions: confirmation.understood_conditions,
    prompt: confirmation.prompt,
    answer_max_length: confirmation.answer_max_length,
    canAnswer: confirmation.actions.includes("answer_text"),
  };
}

/** 질문 하나의 실행, 기준 확인, 수동 복구를 관리한다. 스트림은 받은 키로 연결을 자동 복구한다. */
export function useSearchRun(question: string | null, api: SearchApi) {
  const [snapshot, setSnapshot] = useState<{
    question: string;
    state: RunState;
  } | null>(null);
  const active = useRef<ActiveRun | null>(null);
  const runCounter = useRef(0);
  const apiRef = useRef(api);
  apiRef.current = api;

  const publish = useCallback((run: ActiveRun, state: RunState) => {
    // 취소를 무시하고 늦게 응답하는 어댑터도 새 실행의 상태를 덮지 못한다.
    if (active.current !== run) return;
    // 렌더 전에 버튼을 여러 번 눌러도 첫 동작이 이미 상태를 바꿔 중복 전송을 막는다.
    run.state = state;
    setSnapshot({ question: run.question, state });
  }, []);

  const sendInitial = useCallback(
    async (run: ActiveRun) => {
      const streaming = {
        status: "streaming",
        runId: run.id,
        startedAt: Date.now(),
        view: emptyView(),
      } as const;
      publish(run, streaming);
      // 화면과 잠금은 즉시 갱신한다. 실제 전송을 미뤄 StrictMode 에서 바로 정리된 효과가 요청을 보내지 않게 한다.
      await Promise.resolve();
      if (active.current !== run) return;

      try {
        const result = await runSearchStream(
          apiRef.current,
          run.question,
          run.controller.signal,
          (view) => publish(run, { ...streaming, view }),
          undefined,
          run.requestKey,
        );
        if (active.current !== run) return;
        if (result.kind === "response") {
          publish(run, {
            status: "done",
            runId: run.id,
            data: result.response,
          });
          return;
        }
        run.confirmation = {
          session: result.confirmation.session,
          request: null,
        };
        publish(run, {
          status: "confirm",
          runId: run.id,
          confirmation: confirmForm(result.confirmation),
          phase: { phase: "awaiting" },
        });
      } catch (reason) {
        if (active.current !== run) return;
        const error =
          reason instanceof ApiError ? reason : new ApiError(0, "unexpected");
        publish(run, {
          status: "failed",
          runId: run.id,
          error,
          recovery: initialRecovery(error),
        });
      }
    },
    [publish],
  );

  const sendConfirmation = useCallback(
    async (
      run: ActiveRun,
      confirmation: ConfirmForm,
      request: ConfirmRequest,
    ) => {
      const submitted: RunState = {
        status: "confirm",
        runId: run.id,
        confirmation,
        phase: { phase: "submitting", answer: request.answer },
      };
      publish(run, submitted);

      try {
        const response = await apiRef.current.confirm(
          request,
          run.controller.signal,
        );
        if (active.current !== run || run.state !== submitted) return;
        const data = validateConfirmSubmitResponse(
          response,
          confirmation.original_question,
        );
        run.confirmation = null;
        publish(run, { status: "done", runId: run.id, data });
      } catch (error) {
        if (active.current !== run || run.state !== submitted) return;
        const failure = confirmFailure(error);
        if (failure.kind === "ended") {
          run.confirmation = null;
          publish(run, {
            status: "confirmEnded",
            runId: run.id,
            reason: failure.reason,
            canRestart: failure.reason !== "unsupported",
          });
          return;
        }

        publish(run, {
          ...submitted,
          phase: {
            phase: "pending",
            answer: request.answer,
            recovery: failure,
          },
        });
      }
    },
    [publish],
  );

  const cancel = useCallback(() => {
    const previous = active.current;
    active.current = null;
    if (previous !== null) {
      previous.confirmation = null;
      previous.state = IDLE;
      previous.controller.abort();
    }
  }, []);

  const start = useCallback(
    (nextQuestion: string) => {
      cancel();
      const run: ActiveRun = {
        id: ++runCounter.current,
        question: nextQuestion,
        requestKey: crypto.randomUUID(),
        controller: new AbortController(),
        state: IDLE,
        confirmation: null,
      };
      active.current = run;
      void sendInitial(run);
    },
    [cancel, sendInitial],
  );

  // URL 질문이 바뀌는 커밋에서 이전 실행을 끊는다. 상품 패널만 열고 닫을 때는 같은 실행을 유지한다.
  useLayoutEffect(() => {
    if (question === null) setSnapshot(null);
    else start(question);
    return cancel;
  }, [question, start, cancel]);

  const state = snapshot?.question === question ? snapshot.state : IDLE;
  const runId = state.status === "idle" ? null : state.runId;
  const startNewSearch = useCallback(() => {
    if (question !== null && active.current?.id === runId) start(question);
  }, [question, runId, start]);

  const submitAnswer = useCallback(
    (answer: string) => {
      const run = active.current;
      if (
        run === null ||
        run.state !== state ||
        state.status !== "confirm" ||
        state.phase.phase !== "awaiting" ||
        !state.confirmation.canAnswer ||
        run.confirmation === null
      )
        return;
      const checked = checkConfirmAnswer(
        answer,
        state.confirmation.answer_max_length,
      );
      if (checked.answer === null) return;

      const { session } = run.confirmation;
      // 답을 처음 보낼 때 세션·버전·답·키를 함께 보관한다. 수동 재전송도 이 요청을 그대로 쓴다.
      const request: ConfirmRequest = Object.freeze({
        idempotencyKey: crypto.randomUUID(),
        sessionId: session.id,
        secret: session.secret,
        version: session.version,
        action: "answer_text",
        answer: checked.answer,
      });
      run.confirmation.request = request;
      void sendConfirmation(run, state.confirmation, request);
    },
    [state, sendConfirmation],
  );

  const resend = useCallback(() => {
    const run = active.current;
    // 이전 실행이나 이전 대기 화면의 클릭은 현재 화면의 요청을 보낼 권한이 없다.
    if (run === null || run.state !== state) return;
    if (state.status === "failed") {
      if (canResend(state.recovery)) void sendInitial(run);
    } else if (
      state.status === "confirm" &&
      state.phase.phase === "pending" &&
      run.confirmation?.request &&
      canResend(state.phase.recovery)
    ) {
      void sendConfirmation(run, state.confirmation, run.confirmation.request);
    }
  }, [state, sendInitial, sendConfirmation]);

  return { state, startNewSearch, submitAnswer, resend };
}
