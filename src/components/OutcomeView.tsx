import { useState, type ReactNode } from "react";
import { CiteFocusContext, MappingFocusContext } from "../lib/citeFocus";
import type { CiteTarget } from "../lib/explain";
import type { StreamPhase } from "../lib/searchStream";
import type { ResultRow, SearchApi, SearchResponse } from "../lib/types";
import { useConcepts, type Concepts } from "../lib/useConcepts";
import { TABLE_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { AnswerCard, BaseDates } from "./AnswerCard";
import { ConceptCards } from "./ConceptCards";
import { Icon } from "./Icon";
import { InterpretationCard } from "./InterpretationCard";
import { ProcessView } from "./ProcessView";
import { QuestionChips } from "./QuestionChips";
import { SearchGraph } from "./SearchGraph";
import { ResultGroupView } from "./ResultGroup";

type Tone = "info" | "warn" | "danger";

function StateBox({
  tone,
  title,
  response,
  children,
}: {
  tone: Tone;
  title: string;
  response: SearchResponse;
  children?: ReactNode;
}) {
  const notices = response.answer.notices;
  return (
    <section
      className={`state card state--${tone}`}
      role={tone === "danger" ? "alert" : undefined}
      aria-labelledby="state-heading"
    >
      <Icon name={tone === "info" ? "info" : "alert"} size={20} />
      <div className="state__body">
        <h2 id="state-heading">{title}</h2>
        <p>{response.answer.text}</p>
        {notices.length > 0 && (
          <ul className="notices">
            {notices.map((notice) => (
              <li key={notice.code + notice.text}>
                <span>{notice.text}</span>
              </li>
            ))}
          </ul>
        )}
        {children}
        <BaseDates response={response} />
      </div>
    </section>
  );
}

type View = "result" | "graph" | "process";

const VIEW_LABEL: Record<View, string> = {
  result: "결과",
  graph: "그래프",
  process: "처리 과정",
};

/**
 * 결과 화면 전체(37 4-3 + W7 + r8). 구성은 위에서부터
 *   ① 질문 해석(대상·조건·정렬) ② 탐색 그래프(온톨로지 → 집합 → 상품)
 *   ③ 어떻게 답했나(처리 단계·판정·시간) ④ outcome별 본문.
 * 좁은 화면(<720px)에서는 ①을 늘 보이고, 나머지를 [결과 | 그래프 | 처리 과정] 전환으로 나눈다.
 */
export function OutcomeView({
  response,
  stream,
  selectedId,
  onOpen,
  onRetry,
  api,
}: {
  response: SearchResponse;
  /** 스트리밍 중일 때만. phase 가 undefined 면 최종 답까지 받은 것이다(후속 질문·done 대기). */
  stream?: { phase: StreamPhase | undefined; sentences: string[] };
  selectedId: string | null;
  onOpen?: (domain: string, row: ResultRow) => void;
  onRetry: () => void;
  /** 개념 설명을 부를 API. 없으면 설명 영역을 만들지 않는다. */
  api?: Pick<SearchApi, "explain">;
}) {
  // 설명은 최종 응답(done)이 온 뒤 검색 실행당 한 번만 부른다. 탭을 바꿔 본문이 다시 그려져도 여기 상태가 남는다.
  const concepts = useConcepts(response, stream === undefined, api);
  const wide = useMediaQuery(TABLE_QUERY);
  const [view, setView] = useState<View>("result");
  const [focus, setFocus] = useState<CiteTarget | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const hasProcess =
    response.trace !== null && response.answer.generated_by !== "fallback";
  const hasGraph = response.interpretation.graph.nodes.length > 0;
  const views: View[] = [
    "result",
    ...(hasGraph ? (["graph"] as const) : []),
    ...(hasProcess ? (["process"] as const) : []),
  ];
  const tabs = !wide && views.length > 1;
  const visibleView = views.includes(view) ? view : "result";

  const body = (
    <OutcomeBody
      response={response}
      stream={stream}
      selectedId={selectedId}
      onOpen={onOpen}
      onRetry={onRetry}
      concepts={concepts}
    />
  );

  const graph = <SearchGraph response={response} onOpen={onOpen} />;
  const panel: Record<View, ReactNode> = {
    result: body,
    graph,
    process: <ProcessView response={response} />,
  };

  return (
    <CiteFocusContext.Provider value={{ focus, setFocus }}>
      <MappingFocusContext.Provider value={{ active, setActive }}>
        <InterpretationCard response={response} />
        {tabs ? (
          <>
            <div className="seg" role="tablist" aria-label="결과 보기 방식">
              {views.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`tab-${key}`}
                  aria-selected={visibleView === key}
                  aria-controls={`panel-${key}`}
                  className="seg__tab"
                  onClick={() => setView(key)}
                >
                  {VIEW_LABEL[key]}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`panel-${visibleView}`}
              aria-labelledby={`tab-${visibleView}`}
              className="seg__panel"
            >
              {panel[visibleView]}
            </div>
          </>
        ) : (
          <>
            {graph}
            {panel.process}
            {body}
          </>
        )}
      </MappingFocusContext.Provider>
    </CiteFocusContext.Provider>
  );
}

/** 스트림에서 아직 못 받은 본문 자리. 화면이 흔들리지 않게 한 줄 높이를 잡는다. */
function StreamPending({ text }: { text: string }) {
  return (
    <div className="card stream-pending" role="status">
      <span className="spinner" aria-hidden="true" />
      <p className="muted">{text}</p>
    </div>
  );
}

/** outcome별 본문. 상태마다 무엇을 보여주고 무엇을 숨기는지가 여기 한곳에 있다. */
function OutcomeBody({
  response,
  stream,
  selectedId,
  onOpen,
  onRetry,
  concepts,
}: {
  response: SearchResponse;
  stream?: { phase: StreamPhase | undefined; sentences: string[] };
  selectedId: string | null;
  onOpen?: (domain: string, row: ResultRow) => void;
  onRetry: () => void;
  concepts: Concepts;
}) {
  const { outcome, interpretation, results } = response;

  const groups = results.map((group) => (
    <ResultGroupView
      key={group.domain}
      group={group}
      domain={interpretation.domains.find((d) => d.domain === group.domain)}
      sort={interpretation.sort}
      selectedId={selectedId}
      onOpen={onOpen ? (row) => onOpen(group.domain, row) : undefined}
    />
  ));

  // 표가 오기 전, 또는 답 문장 없이 최종 답을 기다리는 상태는 자리만 잡는다.
  if (stream?.phase === "results")
    return <StreamPending text="조회하고 있습니다." />;
  if (
    stream?.phase === "answer" &&
    outcome !== "answered" &&
    outcome !== "caveat"
  )
    return <StreamPending text="답변을 정리하고 있습니다." />;

  switch (outcome) {
    case "answered":
    case "caveat":
      return (
        <>
          <AnswerCard
            response={response}
            sentences={
              stream?.phase === "answer" ? stream.sentences : undefined
            }
          />
          {groups}
          <ConceptCards concepts={concepts} />
          <QuestionChips
            title="이어서 물어볼 질문"
            options={response.suggestions}
          />
        </>
      );
    case "no_result":
      return (
        <>
          <StateBox
            tone="info"
            title="조건에 맞는 상품이 없습니다"
            response={response}
          />
          <QuestionChips
            title="조건을 바꿔 보세요"
            options={response.suggestions}
          />
        </>
      );
    case "not_collected":
      return (
        <>
          <StateBox
            tone="info"
            title="수집하지 않은 데이터입니다"
            response={response}
          />
          <QuestionChips
            title="대신 물어볼 수 있는 질문"
            options={response.suggestions}
          />
        </>
      );
    case "unread":
      return (
        <>
          <StateBox
            tone="info"
            title="질문 일부를 읽지 못했습니다"
            response={response}
          />
          <QuestionChips
            title="다시 물어볼 질문"
            options={response.suggestions}
          />
        </>
      );
    case "unavailable":
      return (
        <StateBox tone="warn" title="일시적인 연결 문제" response={response}>
          <button type="button" className="secondary" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            다시 시도
          </button>
        </StateBox>
      );
    case "ambiguous":
      return (
        <>
          <StateBox tone="info" title="조건을 골라 주세요" response={response}>
            {response.clarify && (
              <p className="state__reason">{response.clarify.reason}</p>
            )}
          </StateBox>
          <QuestionChips
            title="구체화한 질문으로 다시 검색"
            options={response.clarify?.options ?? []}
          />
        </>
      );
    case "refused":
      return (
        <>
          <StateBox
            tone="info"
            title="답하지 않는 질문입니다"
            response={response}
          />
          <QuestionChips
            title="대신 할 수 있는 질문"
            options={response.suggestions}
          />
        </>
      );
    case "error":
      return (
        <StateBox
          tone="danger"
          title="답변을 만들지 못했습니다"
          response={response}
        >
          <p className="muted small">
            요청 ID <span className="code">{response.request_id}</span>
          </p>
          <button type="button" className="secondary" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            다시 시도
          </button>
        </StateBox>
      );
  }
}
