import { useCountdown } from "../lib/useCountdown";
import { useEffect, useState } from "react";
import { IN_PROGRESS_RETRY_SECONDS, type ApiError } from "../lib/types";
import { Icon } from "./Icon";

/** 경과 초를 1초마다 다시 그린다. */
function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/**
 * 검색 중. 게이트 경로는 수십 ms, 생성 경로는 3~6초라 경과 초를 보여 기다릴 근거를 준다.
 */
export function SearchLoading({
  startedAt,
  retrying = false,
}: {
  startedAt: number;
  retrying?: boolean;
}) {
  const elapsed = useElapsed(startedAt);
  return (
    <div className="loading card" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="loading__title">
          검색 중 <span className="num">· {elapsed}초</span>
        </p>
        <p className="muted">
          {retrying
            ? "연결이 끊겨 다시 시도하고 있습니다."
            : elapsed < 2
              ? "질문을 해석하고 조회하고 있습니다."
              : "답변 문장을 만들고 있습니다. 보통 3~6초 걸립니다."}
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
export function RetryingNotice() {
  return (
    <div className="banner banner--warn" role="status">
      <Icon name="refresh" size={16} />
      연결이 끊겨 다시 시도하고 있습니다. 표는 그대로이고 답변 문장을 새로
      받습니다.
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

/**
 * 최초 검색의 409. code 로 세 가지를 가른다.
 * - turn_in_progress: 서버가 같은 키의 요청을 처리 중이다. 대기 뒤 사용자가 누르면 **같은 요청**(같은 키)을 보낸다.
 * - session_conflict·turn_indeterminate: 같은 키로는 회복하지 않는다. 재전송 없이 새 검색(새 키)만 연다.
 */
export function SearchConflict({
  error,
  onResend,
  onNewSearch,
}: {
  error: ApiError;
  onResend: () => void;
  onNewSearch: () => void;
}) {
  const waiting = error.code === "turn_in_progress";
  const left = useCountdown(
    waiting ? (error.retryAfter ?? IN_PROGRESS_RETRY_SECONDS) : null,
  );
  const message = waiting
    ? {
        title: "기존 요청을 처리하고 있습니다",
        body: "같은 질문을 서버가 아직 처리하고 있습니다. 자동으로 다시 보내지 않으며, 잠시 뒤 같은 요청을 직접 다시 보낼 수 있습니다.",
      }
    : error.code === "turn_indeterminate"
      ? {
          title: "이 요청은 이어갈 수 없습니다",
          body: "새 검색으로 시작해 주세요. 같은 요청을 다시 보내도 처리 결과를 알 수 없습니다.",
        }
      : {
          title: "요청이 충돌했습니다",
          body: "같은 요청 번호가 다른 질문에 이미 쓰였습니다. 새 검색으로 시작해 주세요.",
        };
  return (
    <div className="state card state--danger" role="alert">
      <Icon name="alert" size={20} />
      <div className="state__body">
        <h2>{message.title}</h2>
        <p>{message.body}</p>
        {waiting && left > 0 && (
          <p className="num">{left}초 뒤에 다시 보낼 수 있습니다.</p>
        )}
        {error.requestId && (
          <p className="muted small">
            요청 ID <span className="code">{error.requestId}</span>
          </p>
        )}
        {waiting ? (
          <button
            type="button"
            className="secondary"
            disabled={left > 0}
            onClick={onResend}
          >
            <Icon name="refresh" size={16} />
            같은 요청 다시 보내기
          </button>
        ) : (
          <button type="button" className="secondary" onClick={onNewSearch}>
            <Icon name="refresh" size={16} />새 검색으로 시작
          </button>
        )}
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
  const left = useCountdown(error.status === 429 ? error.retryAfter : null);
  const { title, body } = describe(error);
  const canRetry = onRetry && error.status !== 404 && error.status !== 422;
  return (
    <div className="state card state--danger" role="alert">
      <Icon name="alert" size={20} />
      <div className="state__body">
        <h2>{title}</h2>
        <p>{body}</p>
        {error.status === 429 && left > 0 && (
          <p className="num">{left}초 뒤에 다시 시도할 수 있습니다.</p>
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
