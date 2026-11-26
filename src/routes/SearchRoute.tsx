import { useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ConfirmView } from "../components/ConfirmView";
import { InvestmentNotice } from "../components/Common";
import { InterpretationDraft } from "../components/InterpretationDraft";
import { useTitle } from "../lib/useTitle";
import { OutcomeView } from "../components/OutcomeView";
import {
  IN_PROGRESS_TITLE,
  PendingRecovery,
} from "../components/PendingRecovery";
import { ProductDetailView } from "../components/ProductDetail";
import { SearchBox } from "../components/SearchBox";
import {
  RequestFailed,
  RetryingNotice,
  SearchConflict,
  SearchLoading,
} from "../components/StatusViews";
import { productHref, searchHref } from "../lib/format";
import { provisionalResponse, streamPhase } from "../lib/searchStream";
import { ApiError, QUESTION_MAX, type SearchApi } from "../lib/types";
import { useMediaQuery, WIDE_QUERY } from "../lib/useMediaQuery";
import { useSearchRun, type RunState } from "../lib/useSearchRun";

/**
 * 결과 화면 `/search?q=…`. 질문은 URL에만 있다 — 새로고침·뒤로가기·링크 공유가 그대로 된다.
 * 넓은 화면에서 상품을 누르면 `&p=도메인/id`를 붙여 오른쪽 패널에 상세를 연다.
 * 좁은 화면에서는 상세 페이지로 이동한다.
 */
export function SearchRoute({ api }: { api: SearchApi }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wide = useMediaQuery(WIDE_QUERY);
  const question = params.get("q")?.trim() || null;
  const selected = parseSelected(params.get("p"));
  const tooLong = question !== null && question.length > QUESTION_MAX;

  useTitle(question);

  const { state, startNewSearch, submitAnswer, resend } = useSearchRun(
    tooLong ? null : question,
    api,
  );
  // 스트리밍 중에는 지금까지 받은 것으로 임시 응답을 만들어 같은 화면으로 그린다.
  const streaming =
    state.status === "streaming" && question !== null
      ? provisionalResponse(state.view, question)
      : null;
  // 스트리밍 중과 완성 뒤를 같은 자리의 같은 OutcomeView(같은 key)로 그려 상태를 이어 간다.
  const shown = state.status === "done" ? state.data : streaming;
  const announcement = searchAnnouncement(state);

  const submit = (next: string) => {
    // URL의 질문이 같으면 훅의 URL 변경 효과가 실행되지 않으므로 직접 새 검색을 시작한다.
    if (!tooLong && next === question) startNewSearch();
    navigate(searchHref(next));
  };

  const openProduct = (domain: string, productId: string) => {
    if (!wide || !question) {
      navigate(productHref(domain, productId));
      return;
    }
    setParams({ q: question, p: `${domain}/${productId}` });
  };

  const closePanel = () => {
    if (question) setParams({ q: question });
  };

  const showPanel = wide && selected !== null && state.status === "done";

  return (
    <div className={`results ${showPanel ? "results--panel" : ""}`}>
      <div className="results__bar">
        <SearchBox
          initial={question ?? ""}
          inputRef={searchInputRef}
          onSubmit={submit}
        />
      </div>

      <div className="results__body">
        <div className="results__main">
          <h1 className="visually-hidden">
            {question ? `"${question}" 검색 결과` : "검색"}
          </h1>
          {/* 진행 문장만 바꿔 안내한다. 경과 시간과 미리보기 본문은 이 영역 밖에 둔다. */}
          <p className="visually-hidden" role="status" aria-label="검색 진행">
            {announcement}
          </p>
          {question === null && (
            <p className="muted">질문을 입력하면 결과가 여기에 나옵니다.</p>
          )}
          {tooLong && (
            <RequestFailed error={new ApiError(422, "question_too_long")} />
          )}
          {/* 최종 해석 전: 미리보기가 있으면 그것을, 없으면 기존 로딩을 같은 자리에 그린다. */}
          {state.status === "streaming" &&
            streaming === null &&
            (state.view.draft !== null &&
            state.view.question !== null &&
            !state.view.retrying ? (
              <InterpretationDraft
                question={state.view.question}
                draft={state.view.draft}
                startedAt={state.startedAt}
              />
            ) : (
              <SearchLoading
                startedAt={state.startedAt}
                description={announcement}
                retrying={state.view.retrying}
              />
            ))}
          {(state.status === "confirm" || state.status === "confirmEnded") && (
            <ConfirmView
              key={state.runId}
              state={state}
              onSubmit={submitAnswer}
              onResend={resend}
              onRestart={startNewSearch}
              onRewrite={() => navigate("/")}
            />
          )}
          {state.status === "failed" &&
            (state.recovery.kind === "inProgress" ||
              state.recovery.kind === "unknown") && (
              <PendingRecovery
                state={state.recovery}
                requestId={state.error.requestId}
                onResend={(event) => {
                  // 재전송 중 버튼이 사라진다. 버튼에 있던 초점만 계속 보이는 검색창으로 옮긴다.
                  if (event.currentTarget === document.activeElement)
                    searchInputRef.current?.focus();
                  resend();
                }}
              />
            )}
          {state.status === "failed" && state.recovery.kind === "conflict" && (
            <SearchConflict error={state.error} onNewSearch={startNewSearch} />
          )}
          {state.status === "failed" && state.recovery.kind === "failed" && (
            <RequestFailed
              error={state.error}
              onRetry={state.recovery.canRestart ? startNewSearch : undefined}
            />
          )}
          {state.status === "streaming" &&
            state.view.retrying &&
            shown !== null && (
              <RetryingNotice hasResults={state.view.results !== null} />
            )}
          {shown !== null &&
            (state.status === "streaming" || state.status === "done") && (
              <OutcomeView
                key={state.runId}
                response={shown}
                stream={
                  state.status === "streaming"
                    ? {
                        phase: streamPhase(state.view),
                        sentences: state.view.sentences,
                        retrying: state.view.retrying,
                      }
                    : undefined
                }
                selectedId={selected?.productId ?? null}
                onOpen={(domain, row) => openProduct(domain, row.product_id)}
                onRetry={startNewSearch}
                api={api}
              />
            )}
          {question !== null && <InvestmentNotice />}
        </div>

        {showPanel && (
          <aside className="results__panel" aria-label="상품 상세">
            <ProductDetailView
              api={api}
              domain={selected.domain}
              productId={selected.productId}
              headingLevel={2}
              onClose={closePanel}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

/** 확인된 이벤트와 실행 상태가 바뀔 때만 안내 문장을 바꾼다. */
function searchAnnouncement(state: RunState): string {
  if (state.status === "streaming") {
    const { view } = state;
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
  if (state.status === "done" && state.data.outcome !== "error")
    return "검색 결과를 불러왔습니다.";
  return "";
}

function parseSelected(
  value: string | null,
): { domain: string; productId: string } | null {
  if (!value) return null;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  return { domain: value.slice(0, slash), productId: value.slice(slash + 1) };
}
