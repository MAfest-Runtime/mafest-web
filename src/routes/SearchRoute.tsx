import { useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ConfirmView } from "../components/ConfirmView";
import { InvestmentNotice } from "../components/Common";
import { InterpretationDraft } from "../components/InterpretationDraft";
import { useTitle } from "../lib/useTitle";
import { OutcomeView } from "../components/OutcomeView";
import { PendingRecovery } from "../components/PendingRecovery";
import { ProductDetailView } from "../components/ProductDetail";
import { SearchBox } from "../components/SearchBox";
import {
  RequestFailed,
  RetryingNotice,
  SearchConflict,
  SearchLoading,
} from "../components/StatusViews";
import { productHref, searchHref } from "../lib/format";
import { presentSearch } from "../lib/searchPresentation";
import { ApiError, QUESTION_MAX, type SearchApi } from "../lib/types";
import { useMediaQuery, WIDE_QUERY } from "../lib/useMediaQuery";
import { useSearchRun } from "../lib/useSearchRun";

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
  const presentation = presentSearch(state, question);

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

  const showPanel =
    wide &&
    selected !== null &&
    presentation.kind === "result" &&
    presentation.result.finalized;

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
            {presentation.announcement}
          </p>
          {question === null && (
            <p className="muted">질문을 입력하면 결과가 여기에 나옵니다.</p>
          )}
          {tooLong && (
            <RequestFailed error={new ApiError(422, "question_too_long")} />
          )}
          {presentation.kind === "draft" && (
            <InterpretationDraft
              question={presentation.question}
              draft={presentation.draft}
              startedAt={presentation.startedAt}
            />
          )}
          {presentation.kind === "loading" && (
            <SearchLoading
              startedAt={presentation.startedAt}
              description={presentation.announcement}
              retrying={presentation.retrying}
            />
          )}
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
          {presentation.kind === "result" && presentation.retry && (
            <RetryingNotice hasResults={presentation.retry.hasResults} />
          )}
          {presentation.kind === "result" && (
            <OutcomeView
              key={presentation.runId}
              result={presentation.result}
              selectedId={selected?.productId ?? null}
              onOpen={openProduct}
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

function parseSelected(
  value: string | null,
): { domain: string; productId: string } | null {
  if (!value) return null;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  return { domain: value.slice(0, slash), productId: value.slice(slash + 1) };
}
