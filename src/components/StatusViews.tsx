import { useCountdown } from "../lib/useCountdown";
import { useElapsed } from "../lib/useElapsed";
import type { ApiError } from "../lib/types";
import { Icon } from "./Icon";

/**
 * 검색 중. 해석 미리보기(draft)가 없을 때의 기본 안내다. 경과 초를 보여 기다릴 근거를 준다.
 */
export function SearchLoading({
  startedAt,
  description,
  retrying = false,
}: {
  startedAt: number;
  description: string;
  retrying?: boolean;
}) {
  const elapsed = useElapsed(startedAt);
  return (
    <div className="loading card">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="loading__title">
          검색 중 <span className="num">· {elapsed}초</span>
        </p>
        <p className="muted">
          {retrying ? "연결이 끊겨 다시 시도하고 있습니다." : description}
        </p>
      </div>
      <div className="skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

/** 스트림이 끊겨 한 번 다시 요청하는 동안 표 위에 띄우는 안내. 그동안 답 문장 영역은 비어 있다. */
export function RetryingNotice({ hasResults }: { hasResults: boolean }) {
  return (
    <div className="banner banner--warn">
      <Icon name="refresh" size={16} />
      <span>
        연결이 끊겨 다시 시도하고 있습니다.
        {hasResults && " 받은 조회 결과를 유지하고 답변을 다시 받습니다."}
      </span>
    </div>
  );
}

function describe(error: ApiError): { title: string; body: string } {
  if (error.status === 429)
    return {
      title: "요청이 너무 많습니다",
      body: "공개 데모라 짧은 시간에 보낼 수 있는 질문 수를 제한합니다.",
    };
  if (error.status === 504)
    return {
      title: "시간이 초과됐습니다",
      body: "답을 만들지 못했습니다. 조건을 줄여 다시 물어보세요.",
    };
  if (error.status === 422)
    return {
      title: "질문 형식이 맞지 않습니다",
      body: "질문은 1~200자로 입력해 주세요.",
    };
  if (error.status === 404)
    return {
      title: "찾을 수 없습니다",
      body: "요청한 상품이 없거나 공개 범위 밖입니다.",
    };
  if (error.status === 503)
    return {
      title: "지금 이 데이터를 불러올 수 없습니다",
      body: "잠시 뒤 다시 시도해 주세요.",
    };
  if (error.status === 0)
    return {
      title: "서버에 연결할 수 없습니다",
      body: "네트워크 상태를 확인하고 다시 시도해 주세요.",
    };
  if (error.code === "invalid_response")
    return {
      title: "응답 형식이 올바르지 않습니다",
      body: "서버와 화면의 버전이 맞지 않을 수 있습니다. 잠시 뒤 다시 시도해 주세요.",
    };
  return {
    title: "서버 오류가 났습니다",
    body: "잠시 뒤 다시 시도해 주세요.",
  };
}

/** 검색 실행을 이어갈 수 없는 충돌은 새 검색으로 시작한다. */
export function SearchConflict({
  error,
  onNewSearch,
}: {
  error: ApiError;
  onNewSearch: () => void;
}) {
  const message =
    error.code === "turn_indeterminate"
      ? {
          title: "이 요청은 더 이어갈 수 없습니다",
          body: "새 검색으로 시작해 주세요.",
        }
      : {
          title: "요청이 충돌했습니다",
          body: "요청 정보가 서버의 기록과 일치하지 않습니다. 새 검색으로 시작해 주세요.",
        };
  return (
    <div className="state card state--danger" role="alert">
      <Icon name="alert" size={20} />
      <div className="state__body">
        <h2>{message.title}</h2>
        <p>{message.body}</p>
        {error.requestId && (
          <p className="muted small">
            요청 ID <span className="code">{error.requestId}</span>
          </p>
        )}
        <div className="search-actions">
          <button type="button" className="button" onClick={onNewSearch}>
            <Icon name="refresh" size={16} />새 검색으로 시작
          </button>
        </div>
      </div>
    </div>
  );
}

/** HTTP 수준 실패(429·504·5xx·연결 실패·형식 오류). */
export function RequestFailed({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  const retryAfter = error.status === 429 ? error.retryAfter : null;
  const left = useCountdown(retryAfter);
  const { title, body } = describe(error);
  const canRetry = onRetry && error.status !== 404 && error.status !== 422;
  return (
    <div className="state card state--danger">
      <Icon name="alert" size={20} />
      <div className="state__body">
        <div className="recovery__message" role="alert">
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        {retryAfter !== null && retryAfter > 0 && (
          <div className="recovery__wait">
            {left > 0 && <p>{left}초 뒤에 다시 시도할 수 있습니다.</p>}
            <p
              role="status"
              className={left > 0 ? "visually-hidden" : undefined}
            >
              {left === 0 && "이제 다시 시도할 수 있습니다."}
            </p>
          </div>
        )}
        {error.requestId && (
          <p className="muted small">
            요청 ID <span className="code">{error.requestId}</span>
          </p>
        )}
        {canRetry && (
          <button
            type="button"
            className="secondary"
            onClick={onRetry}
            disabled={error.status === 429 && left > 0}
          >
            <Icon name="refresh" size={16} />
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
}
