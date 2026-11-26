import { explainRequestFor } from "./concepts";
import type { StreamView } from "./searchStream";
import { isTableOutcome } from "./types";
import type {
  Answer,
  ExplainRequest,
  Outcome,
  QuestionOption,
  SearchGraph,
  SearchResponse,
  StreamInterpretationDraft,
  TableOutcome,
} from "./types";
import type { RunState } from "./useSearchRun";

export const IN_PROGRESS_TITLE = "기존 요청을 처리하고 있습니다";

type ResultContext = Pick<
  SearchResponse,
  "question" | "interpretation" | "results"
> & { outcome: Outcome | null; answer: Answer | null };

export type DisplayedAnswer =
  | { kind: "writing"; sentences: string[]; retrying: boolean }
  | { kind: "complete"; answer: Answer };

type AnswerContext = Pick<
  SearchResponse,
  "interpretation" | "clarify" | "outcome"
> & { request_id: string | null };

export type StateAnswer = AnswerContext & {
  outcome: Exclude<Outcome, TableOutcome>;
  answer: Answer;
};

export type ProcessPresentation = SearchResponse & {
  trace: NonNullable<SearchResponse["trace"]>;
};

type ResultBody =
  | { kind: "pending"; message: string | null }
  | {
      kind: "answer";
      answer: DisplayedAnswer;
      caveat: boolean;
    }
  | { kind: "state"; response: StateAnswer };

export interface ConceptRequest {
  requestId: string;
  body: ExplainRequest;
}

export interface ResultPresentation {
  finalized: boolean;
  context: ResultContext;
  body: ResultBody;
  process: ProcessPresentation | null;
  explanation: ConceptRequest | null;
  followUp: { title: string; options: QuestionOption[] };
}

type SearchPresentation = { announcement: string } & (
  | { kind: "other" }
  | { kind: "loading"; startedAt: number; retrying: boolean }
  | {
      kind: "draft";
      startedAt: number;
      question: string;
      draft: StreamInterpretationDraft;
    }
  | {
      kind: "result";
      runId: number;
      result: ResultPresentation;
      retry: { hasResults: boolean } | null;
    }
);

/** 검색 실행이 받은 데이터에서 화면에 표시할 내용과 진행 안내를 정한다. */
export function presentSearch(
  state: RunState,
  question: string | null,
): SearchPresentation {
  if (state.status === "done") {
    const response = state.data;
    const explanation = explainRequestFor(response);
    const { trace } = response;
    return {
      kind: "result",
      runId: state.runId,
      retry: null,
      announcement:
        response.outcome === "error" ? "" : "검색 결과를 불러왔습니다.",
      result: {
        finalized: true,
        context: response,
        body: presentAnswer(response, {
          kind: "complete",
          answer: response.answer,
        }),
        followUp: followUpQuestions(response.outcome, response.suggestions),
        // 대체 답변의 실패 사유는 API 진단에만 남긴다.
        process:
          trace && response.answer.generated_by !== "fallback"
            ? { ...response, trace }
            : null,
        explanation: explanation
          ? { requestId: response.request_id, body: explanation }
          : null,
      },
    };
  }

  if (state.status !== "streaming")
    return { kind: "other", announcement: recoveryAnnouncement(state) };

  const { view, startedAt, runId } = state;
  const announcement = streamAnnouncement(view);
  if (view.interpretation === null || question === null) {
    if (view.draft && view.question && !view.retrying)
      return {
        kind: "draft",
        announcement,
        startedAt,
        question: view.question,
        draft: view.draft,
      };
    return {
      kind: "loading",
      announcement,
      startedAt,
      retrying: view.retrying,
    };
  }

  // 인용은 결과 확정에 속한다. 중간 스냅샷은 보존하고 화면용 데이터에서만 숨긴다.
  const context: ResultContext = {
    question,
    interpretation: {
      ...view.interpretation,
      graph: withoutGraphCitations(
        view.results?.graph ?? view.interpretation.graph,
      ),
    },
    results: (view.results?.results ?? []).map((group) => {
      const rows = withoutCitations(group.rows);
      return rows === group.rows ? group : { ...group, rows };
    }),
    outcome: view.results?.outcome ?? null,
    answer: view.answer,
  };
  return {
    kind: "result",
    runId,
    retry: view.retrying ? { hasResults: view.results !== null } : null,
    announcement,
    result: {
      finalized: false,
      context,
      body: streamBody(view, context.interpretation),
      process: null,
      explanation: null,
      followUp: followUpQuestions(context.outcome, view.suggestions ?? []),
    },
  };
}

function withoutGraphCitations(graph: SearchGraph): SearchGraph {
  const nodes = withoutCitations(graph.nodes);
  return nodes === graph.nodes ? graph : { ...graph, nodes };
}

function withoutCitations<T extends { cited: boolean }>(items: T[]): T[] {
  if (!items.some((item) => item.cited)) return items;
  return items.map((item) => (item.cited ? { ...item, cited: false } : item));
}

function streamBody(
  view: StreamView,
  interpretation: ResultContext["interpretation"],
): ResultBody {
  const { results, answer, retrying, sentences } = view;
  if (results === null)
    return { kind: "pending", message: retrying ? null : "조회하고 있습니다." };
  return presentAnswer(
    {
      request_id: view.requestId,
      interpretation,
      outcome: results.outcome,
      clarify: results.clarify,
    },
    answer
      ? { kind: "complete", answer }
      : { kind: "writing", sentences, retrying },
  );
}

function presentAnswer(
  context: AnswerContext,
  answer: DisplayedAnswer,
): ResultBody {
  const { outcome, interpretation, request_id, clarify } = context;
  if (
    isTableOutcome(outcome) ||
    (answer.kind === "writing" && answer.sentences.length > 0)
  )
    return { kind: "answer", answer, caveat: outcome === "caveat" };
  if (answer.kind === "writing")
    return {
      kind: "pending",
      message: answer.retrying ? null : "답변을 정리하고 있습니다.",
    };
  return {
    kind: "state",
    response: {
      outcome,
      interpretation,
      request_id,
      clarify,
      answer: answer.answer,
    },
  };
}

const FOLLOW_UP_TITLE: Partial<Record<Outcome, string>> = {
  no_result: "조건을 바꿔 보세요",
  not_collected: "대신 물어볼 수 있는 질문",
  unread: "다시 물어볼 질문",
  refused: "대신 할 수 있는 질문",
};

function followUpQuestions(outcome: Outcome | null, options: QuestionOption[]) {
  const title = outcome === null ? undefined : FOLLOW_UP_TITLE[outcome];
  return { title: title ?? "이어서 물어볼 질문", options };
}

function streamAnnouncement(view: StreamView): string {
  if (view.retrying) {
    return view.results === null
      ? "서버 연결이 끊겼습니다. 자동으로 다시 시도합니다."
      : "서버 연결이 끊겼습니다. 받은 조회 결과를 유지하고 답변을 다시 받습니다.";
  }
  if (view.answer !== null)
    return "답변을 받았습니다. 검색을 마무리하고 있습니다.";
  if (view.sentences.length > 0) return "답변 문장을 받고 있습니다.";
  if (view.results !== null)
    return "조회 결과를 받았습니다. 답변을 기다리고 있습니다.";
  if (view.interpretation !== null)
    return "조건에 맞는 상품을 조회하고 있습니다.";
  if (view.question !== null) return "질문을 해석하고 있습니다.";
  return "검색 요청의 응답을 기다리고 있습니다.";
}

function recoveryAnnouncement(
  state: Exclude<RunState, { status: "streaming" | "done" }>,
): string {
  if (
    (state.status === "failed" && state.recovery.kind === "inProgress") ||
    (state.status === "confirm" &&
      state.phase.phase === "pending" &&
      state.phase.recovery.kind === "inProgress")
  ) {
    return `${IN_PROGRESS_TITLE}. 대기 시간이 지나면 같은 요청으로 확인할 수 있습니다.`;
  }
  if (state.status === "confirm") {
    if (state.phase.phase === "awaiting")
      return `기준 확인이 필요합니다. ${state.confirmation.prompt}`;
    if (state.phase.phase === "submitting") return "답변을 보내고 있습니다.";
  }
  return "";
}
