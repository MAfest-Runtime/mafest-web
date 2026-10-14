import {
  ApiError,
  StreamCutError,
  StreamUnavailableError,
  type Answer,
  type ConfirmationRequired,
  isConfirmationRequired,
  type Interpretation,
  type QuestionOption,
  type SearchApi,
  type SearchResponse,
  type SearchResult,
  type StreamEvent,
  type StreamResults,
} from "./types";

/** 끊긴 스트림을 다시 요청하기 전에 기다리는 시간(ms). 계약은 1초 이상을 요구한다. */
export const RETRY_DELAY_MS = 1000;

/**
 * 스트림이 지금까지 그려 둔 것. 이벤트가 오는 대로 채워지고, `done`이 오면 완성 응답이 이것을 덮는다.
 * 재시도 중에는 잘린 답을 비우고(sentences·answer·suggestions) 표와 해석은 그대로 둔다 — 데이터가 고정이라
 * 다시 받아도 같고, 비웠다 채우면 화면이 깜빡이기 때문이다.
 */
export interface StreamView {
  requestId: string | null;
  interpretation: Interpretation | null;
  results: StreamResults | null;
  /** 지금까지 덧붙은 답 문장(answer_delta). */
  sentences: string[];
  /** answer_done 이 보낸 최종 답. 오기 전까지 null. */
  answer: Answer | null;
  suggestions: QuestionOption[] | null;
  /** 끊겨서 다시 요청하는 중. 새 스트림의 start 가 오면 false 가 된다. */
  retrying: boolean;
}

/**
 * 스트리밍 중 화면이 어디까지 왔는가. results: 해석만 있고 표는 아직. answer: 표가 있고 답 문장을 받는 중.
 * 최종 답(answer_done)이 오면 더는 스트리밍 단계가 아니다(undefined).
 */
export type StreamPhase = "results" | "answer";

export function streamPhase(view: StreamView): StreamPhase | undefined {
  if (view.results === null) return "results";
  return view.answer === null ? "answer" : undefined;
}

export function emptyView(): StreamView {
  return {
    requestId: null,
    interpretation: null,
    results: null,
    sentences: [],
    answer: null,
    suggestions: null,
    retrying: false,
  };
}

/** 이벤트 하나를 화면 상태에 반영한다. done·error·confirmation_required 는 호출한 쪽이 따로 다룬다. */
export function applyEvent(view: StreamView, event: StreamEvent): StreamView {
  switch (event.event) {
    case "start":
      // 새 스트림이 열리면 앞 시도의 답을 비운다(잘린 답과 새 답이 섞이지 않게).
      return {
        ...view,
        requestId: event.data.request_id,
        sentences: [],
        answer: null,
        suggestions: null,
        retrying: false,
      };
    case "interpretation":
      return { ...view, interpretation: event.data.interpretation };
    case "results":
      return { ...view, results: event.data };
    case "answer_delta":
      return { ...view, sentences: [...view.sentences, event.data.text] };
    case "answer_done":
      return { ...view, answer: event.data.answer };
    case "suggestions":
      return { ...view, suggestions: event.data.suggestions };
    case "done":
    case "error":
    case "confirmation_required":
      return view;
  }
}

/**
 * 지금까지 받은 것으로 화면이 쓸 임시 응답을 만든다. 해석이 아직 안 왔으면 null.
 * 완성 응답과 다른 점: trace 가 없고, 상품 노드 cited 는 false 이며(답변↔표 연결은 done 에서 생긴다),
 * 답 문장은 지금까지 덧붙은 만큼이다.
 */
export function provisionalResponse(
  view: StreamView,
  question: string,
): SearchResponse | null {
  if (view.interpretation === null) return null;
  const graph = view.results?.graph ?? view.interpretation.graph;
  const answer: Answer = view.answer ?? {
    text: view.sentences.join(" "),
    generated_by: "llm",
    notices: [],
  };
  return {
    request_id: view.requestId ?? "",
    question,
    outcome: view.results?.outcome ?? "answered",
    answer,
    interpretation: { ...view.interpretation, graph },
    results: view.results?.results ?? [],
    clarify: view.results?.clarify ?? null,
    suggestions: view.suggestions ?? [],
    trace: null,
  };
}

/** JSON 검색 결과를 스트림 경로와 같은 RunResult 로 맞춘다. */
function resultOf(result: SearchResult): RunResult {
  return isConfirmationRequired(result)
    ? { kind: "confirmation", confirmation: result.confirmation }
    : { kind: "response", response: result };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 최초 검색 한 번의 끝. 완성 응답이거나, 기준 확인이 필요해 상품 조회·요약 없이 멈춘 확인 대기다.
 * 확인 대기는 오류도 성공 결과도 아니다 — 화면은 확인 질문을 그리고, 결과·답변·설명은 아직 없다.
 */
export type RunResult =
  | { kind: "response"; response: SearchResponse }
  | { kind: "confirmation"; confirmation: ConfirmationRequired };

/**
 * 스트림 한 번을 끝까지 읽는다. done 의 완성 응답 또는 confirmation_required 의 확인 대기를 돌려주고,
 * 둘 다 없이 끝나면 StreamCutError 가 난다.
 * API 이터레이터는 마지막 이벤트를 검증한 직후 reader를 취소하므로, 서버가 연결을 늦게 닫아도 여기서는 기다리지 않는다.
 */
async function consume(
  events: AsyncIterable<StreamEvent>,
  initial: StreamView,
  onView: (view: StreamView) => void,
): Promise<RunResult> {
  let view = initial;
  let finished: RunResult | null = null;
  for await (const event of events) {
    if (event.event === "done") {
      finished = { kind: "response", response: event.data.response };
      continue;
    }
    if (event.event === "confirmation_required") {
      finished = { kind: "confirmation", confirmation: event.data };
      continue;
    }
    view = applyEvent(view, event);
    onView(view);
  }
  if (finished === null) throw new StreamCutError();
  return finished;
}

/**
 * 검색 한 번을 스트림으로 돌린다. 화면 갱신은 `onView`로 알리고, 완성 응답(done)을 돌려준다.
 *
 * - 스트림을 쓸 수 없으면(StreamUnavailableError) `POST /v1/search`로 한 번 대신한다. 이 대체는 끊김 재시도가
 *   아니다. 422·429·504 같은 열기 전 오류는 대신하지 않고 그대로 던진다(오류 화면 규칙을 따른다).
 * - done·error 없이 끊기면(StreamCutError) 한 번만 다시 요청한다. 간격은 `retryDelayMs`(1초 이상), 그동안 답을 비운다.
 *   두 번째도 끊기면 연결 실패(ApiError status 0)다. 세 번째 시도는 없다.
 * - error 이벤트와 검사 실패는 ApiError 로 그대로 던진다. 다시 요청하지 않는다.
 * - 사용자가 취소(signal abort)하면 재시도 없이 AbortError 를 던진다.
 * - confirmation_required 는 정상 종료다. 끊김이 아니므로 다시 요청하지 않는다(같은 질문을 두 번 해석하지 않는다).
 * - `runKey`(Idempotency-Key)는 이 실행의 모든 시도(스트림·재시도·JSON 대체)가 같은 값을 쓴다.
 */
export async function runSearchStream(
  api: SearchApi,
  question: string,
  signal: AbortSignal,
  onView: (view: StreamView) => void,
  retryDelayMs: number = RETRY_DELAY_MS,
  runKey?: string,
): Promise<RunResult> {
  let view = emptyView();
  onView(view);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await consume(
        api.searchStream(question, signal, runKey),
        view,
        (next) => {
          view = next;
          onView(next);
        },
      );
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof StreamUnavailableError)
        return resultOf(await api.search(question, signal, runKey));
      if (!(error instanceof StreamCutError)) throw error;
      if (attempt >= 1) throw new ApiError(0, "network");
      view = {
        ...view,
        sentences: [],
        answer: null,
        suggestions: null,
        retrying: true,
      };
      onView(view);
      await delay(retryDelayMs, signal);
    }
  }
}
