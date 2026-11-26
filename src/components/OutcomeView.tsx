import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CiteFocusContext, MappingFocusContext } from "../lib/citeFocus";
import type { CiteTarget } from "../lib/explain";
import type {
  ResultPresentation,
  StateAnswer,
} from "../lib/searchPresentation";
import type { SearchApi } from "../lib/types";
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
type OpenProduct = (domain: string, productId: string) => void;

function StateBox({
  tone,
  title,
  response,
  children,
}: {
  tone: Tone;
  title: string;
  response: StateAnswer;
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
        <BaseDates domains={response.interpretation.domains} />
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
  result,
  selectedId,
  onOpen,
  onRetry,
  api,
}: {
  result: ResultPresentation;
  selectedId: string | null;
  onOpen: OpenProduct;
  onRetry: () => void;
  /** 개념 설명을 부를 API. 없으면 설명 영역을 만들지 않는다. */
  api?: Pick<SearchApi, "explain">;
}) {
  // 설명은 최종 응답(done)이 온 뒤 검색 실행당 한 번만 부른다. 탭을 바꿔 본문이 다시 그려져도 여기 상태가 남는다.
  const { context, process, explanation, finalized, followUp } = result;
  const concepts = useConcepts(explanation, api);
  const wide = useMediaQuery(TABLE_QUERY);
  const [view, setView] = useState<View>("result");
  const [focus, setFocus] = useState<CiteTarget | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const hasGraph = context.interpretation.graph.nodes.length > 0;
  const views: View[] = [
    "result",
    ...(hasGraph ? (["graph"] as const) : []),
    ...(process ? (["process"] as const) : []),
  ];
  const tabs = !wide && views.length > 1;
  const visibleView = views.includes(view) ? view : "result";
  const container = useRef<HTMLDivElement>(null);
  const focused = useRef<Element | null>(null);

  useLayoutEffect(() => {
    // 확정하면서 초점이 있던 후속 질문 등을 없애면 현재 탭이나 결과 영역으로 돌려준다.
    if (
      !finalized ||
      !focused.current ||
      focused.current.isConnected ||
      document.activeElement !== document.body
    )
      return;
    const resultArea = container.current;
    const selectedTab = resultArea?.querySelector<HTMLButtonElement>(
      'button[role="tab"][aria-selected="true"]',
    );
    (selectedTab ?? resultArea)?.focus({ preventScroll: true });
  }, [finalized]);

  const body = (
    <>
      <OutcomeBody
        result={result}
        selectedId={selectedId}
        onOpen={onOpen}
        onRetry={onRetry}
        concepts={concepts}
      />
      <QuestionChips title={followUp.title} options={followUp.options} />
    </>
  );

  const graph = (
    <SearchGraph interpretation={context.interpretation} onOpen={onOpen} />
  );
  const panel: Record<View, ReactNode> = {
    result: body,
    graph,
    process: process && <ProcessView response={process} />,
  };

  return (
    <CiteFocusContext.Provider value={{ focus, setFocus }}>
      <MappingFocusContext.Provider value={{ active, setActive }}>
        <div
          className="seg__panel"
          role="group"
          aria-label="검색 결과"
          tabIndex={-1}
          ref={container}
          onFocusCapture={(event) => {
            focused.current = event.target;
          }}
          onBlurCapture={(event) => {
            if (event.target.isConnected) focused.current = null;
          }}
        >
          <InterpretationCard response={context} />
          {tabs && (
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
          )}
          {wide ? (
            <>
              {graph}
              {panel.process}
              {body}
            </>
          ) : (
            // 처리 과정 탭이 결과 확정 때 생겨도 같은 요소에 결과를 렌더링한다.
            <div
              role={tabs ? "tabpanel" : undefined}
              id={tabs ? `panel-${visibleView}` : undefined}
              aria-labelledby={tabs ? `tab-${visibleView}` : undefined}
              className="seg__panel"
            >
              {panel[visibleView]}
            </div>
          )}
        </div>
      </MappingFocusContext.Provider>
    </CiteFocusContext.Provider>
  );
}

/** 스트림에서 아직 못 받은 본문 자리. 화면이 흔들리지 않게 한 줄 높이를 잡는다. */
function StreamPending({ text }: { text: string }) {
  return (
    <div className="card stream-pending">
      <span className="spinner" aria-hidden="true" />
      <p className="muted">{text}</p>
    </div>
  );
}

/** 결정된 표시 상태를 그린다. 표와 답변 영역은 결과 확정 때도 같은 자리를 쓴다. */
function OutcomeBody({
  result,
  selectedId,
  onOpen,
  onRetry,
  concepts,
}: {
  result: ResultPresentation;
  selectedId: string | null;
  onOpen: OpenProduct;
  onRetry: () => void;
  concepts: Concepts;
}) {
  const { body, context } = result;
  if (body.kind === "pending")
    return body.message && <StreamPending text={body.message} />;

  if (body.kind === "answer") {
    const { interpretation, results } = context;
    return (
      <>
        <AnswerCard
          answer={body.answer}
          caveat={body.caveat}
          domains={interpretation.domains}
          results={results}
        />
        {results.map((group) => (
          <ResultGroupView
            key={group.domain}
            group={group}
            domain={interpretation.domains.find(
              (d) => d.domain === group.domain,
            )}
            sort={interpretation.sort}
            selectedId={selectedId}
            onOpen={(row) => onOpen(group.domain, row.product_id)}
          />
        ))}
        <ConceptCards concepts={concepts} />
      </>
    );
  }

  const { response } = body;
  switch (response.outcome) {
    case "no_result":
      return (
        <StateBox
          tone="info"
          title="조건에 맞는 상품이 없습니다"
          response={response}
        />
      );
    case "not_collected":
      return (
        <StateBox
          tone="info"
          title="수집하지 않은 데이터입니다"
          response={response}
        />
      );
    case "unread":
      return (
        <StateBox
          tone="info"
          title="질문 일부를 읽지 못했습니다"
          response={response}
        />
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
        <StateBox
          tone="info"
          title="답하지 않는 질문입니다"
          response={response}
        />
      );
    case "error":
      return (
        <StateBox
          tone="danger"
          title="답변을 만들지 못했습니다"
          response={response}
        >
          <p>
            요청 처리 중 오류가 발생했습니다. 같은 요청을 다시 보내도 새로
            해석하지 않습니다. 새 검색으로 시작해 주세요.
          </p>
          {response.request_id !== null && (
            <p className="muted small">
              요청 ID <span className="code">{response.request_id}</span>
            </p>
          )}
          <div className="search-actions">
            <button type="button" className="button" onClick={onRetry}>
              <Icon name="refresh" size={16} />새 검색으로 시작
            </button>
          </div>
        </StateBox>
      );
  }
}
