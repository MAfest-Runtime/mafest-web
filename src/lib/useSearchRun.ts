import { useCallback, useEffect, useRef, useState } from "react";
import { emptyView, runSearchStream, type StreamView } from "./searchStream";
import {
  ApiError,
  type ConfirmationRequired,
  type SearchApi,
  type SearchResponse,
} from "./types";

export type RunState =
  | { status: "idle" }
  | { status: "streaming"; runId: number; startedAt: number; view: StreamView }
  | { status: "done"; runId: number; data: SearchResponse }
  /**
   * 서버가 기준 확인을 요구했다. 상품 조회·요약·설명은 없고, 사용자의 답을 기다린다.
   * 검색 성공(done)과 다르다 — 결과·답변이 없는 이 상태를 성공으로 그리지 않는다.
   */
  | { status: "confirm"; runId: number; confirmation: ConfirmationRequired }
  | { status: "failed"; error: ApiError };

/**
 * 검색 한 번을 스트림으로 돌리고 진행 상태를 알려 준다. key(질문)가 바뀌면 이전 검색을 취소하고 새로 시작한다.
 * 페이지를 떠나도 취소한다(재시도하지 않는다). key 가 null 이면 아무것도 하지 않는다.
 *
 * 효과가 한 번 시작될 때마다(새 질문·`retry`) 새 실행 키(Idempotency-Key)를 만든다. 그 실행의 스트림 재시도와
 * JSON 대체는 같은 키를 쓰고, 새 질문·`retry`는 새 키라서 서버가 새 실행으로 본다.
 * `resend`만 직전 실행의 키를 그대로 쓴다 — 서버가 처리 중이라고 답한 같은 요청을 사용자가 다시 보낼 때다.
 *
 * runId 는 검색을 시작할 때마다 새로 붙는다. 화면이 이것을 key 로 쓰면 스트리밍 중에서 완성 응답으로
 * 바뀔 때 다시 마운트되지 않아, 탭·포커스·그래프 등장 애니메이션이 그대로 이어진다.
 */
export function useSearchRun(
  key: string | null,
  api: SearchApi,
): { state: RunState; retry: () => void; resend: () => void } {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const apiRef = useRef(api);
  apiRef.current = api;
  const runCounter = useRef(0);
  // 방금 끝난 실행의 키. resend 가 다음 효과에 한 번만 물려 주고, 효과가 꺼내 쓰면 비운다.
  const lastRunKey = useRef<string | null>(null);
  const resendKey = useRef<string | null>(null);

  useEffect(() => {
    if (key === null) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    runCounter.current += 1;
    const runId = runCounter.current;
    const startedAt = Date.now();
    setState({ status: "streaming", runId, startedAt, view: emptyView() });
    // resend 로 시작한 실행만 이전 키를 이어 쓴다. 질문 변경·retry 는 새 실행이라 새 키다.
    const runKey = resendKey.current ?? crypto.randomUUID();
    resendKey.current = null;
    lastRunKey.current = runKey;
    runSearchStream(
      apiRef.current,
      key,
      controller.signal,
      (view) => {
        if (!controller.signal.aborted)
          setState({ status: "streaming", runId, startedAt, view });
      },
      undefined,
      runKey,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setState(
          result.kind === "confirmation"
            ? { status: "confirm", runId, confirmation: result.confirmation }
            : { status: "done", runId, data: result.response },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "failed",
          error:
            error instanceof ApiError ? error : new ApiError(0, "unexpected"),
        });
      });
    return () => controller.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // 같은 질문·같은 Idempotency-Key 로 다시 보낸다(409 turn_in_progress 뒤 사용자가 누를 때만 쓴다).
  const resend = useCallback(() => {
    resendKey.current = lastRunKey.current;
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry, resend };
}
