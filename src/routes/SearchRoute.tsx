import { useNavigate, useSearchParams } from "react-router";
import { InvestmentNotice } from "../components/Common";
import { useTitle } from "../lib/useTitle";
import { OutcomeView } from "../components/OutcomeView";
import { ProductDetailView } from "../components/ProductDetail";
import { SearchBox } from "../components/SearchBox";
import {
  RequestFailed,
  RetryingNotice,
  SearchLoading,
} from "../components/StatusViews";
import { productHref, searchHref } from "../lib/format";
import { provisionalResponse, streamPhase } from "../lib/searchStream";
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
  const wide = useMediaQuery(WIDE_QUERY);
  const question = params.get("q")?.trim() || null;
  const selected = parseSelected(params.get("p"));
  const tooLong = question !== null && question.length > QUESTION_MAX;

  useTitle(question);

  const { state, retry } = useSearchRun(tooLong ? null : question, api);
  // 스트리밍 중에는 지금까지 받은 것으로 임시 응답을 만들어 같은 화면으로 그린다.
  const streaming =
    state.status === "streaming" && question !== null
      ? provisionalResponse(state.view, question)
      : null;
  // 스트리밍 중과 완성 뒤를 같은 자리의 같은 OutcomeView(같은 key)로 그려 상태를 이어 간다.
  const shown = state.status === "done" ? state.data : streaming;

  const submit = (next: string) => navigate(searchHref(next));

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
        <SearchBox initial={question ?? ""} onSubmit={submit} />
      </div>

      <div className="results__body">
        <div className="results__main">
          <h1 className="visually-hidden">
            {question ? `"${question}" 검색 결과` : "검색"}
          </h1>
          {question === null && (
            <p className="muted">질문을 입력하면 결과가 여기에 나옵니다.</p>
          )}
          {tooLong && (
            <RequestFailed error={new ApiError(422, "question_too_long")} />
          )}
          {state.status === "streaming" && streaming === null && (
            <SearchLoading
              startedAt={state.startedAt}
              retrying={state.view.retrying}
            />
          )}
          {state.status === "failed" && (
            <RequestFailed error={state.error} onRetry={retry} />
          )}
          {state.status === "streaming" &&
            state.view.retrying &&
            shown !== null && <RetryingNotice />}
          {shown !== null &&
            state.status !== "failed" &&
            state.status !== "idle" && (
              <OutcomeView
                key={state.runId}
                response={shown}
                stream={
                  state.status === "streaming"
                    ? {
                        phase: streamPhase(state.view),
                        sentences: state.view.sentences,
                      }
                    : undefined
                }
                selectedId={selected?.productId ?? null}
                onOpen={(domain, row) => openProduct(domain, row.product_id)}
                onRetry={retry}
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
