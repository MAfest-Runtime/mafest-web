import {
  useId,
  useLayoutEffect,
  useRef,
  type MouseEventHandler,
  type RefObject,
} from "react";
import { IN_PROGRESS_TITLE } from "../lib/searchPresentation";
import { useDeadlineCountdown } from "../lib/useCountdown";
import type { PendingRequestRecovery } from "../lib/useSearchRun";
import { Icon } from "./Icon";

export function SentAnswer({ answer }: { answer: string }) {
  return (
    <dl className="sent-answer">
      <dt>보낸 답변</dt>
      <dd>{answer}</dd>
    </dl>
  );
}

/** 최초 검색과 기준 확인이 같은 요청을 다시 확인할 때 쓰는 안내와 행동. */
export function PendingRecovery({
  state,
  answer,
  focusFrom,
  requestId,
  onResend,
  onRewrite,
}: {
  state: PendingRequestRecovery;
  answer?: string;
  focusFrom?: RefObject<HTMLElement | null>;
  requestId?: string | null;
  onResend: MouseEventHandler<HTMLButtonElement>;
  onRewrite?: () => void;
}) {
  const titleId = useId();
  const inProgress = state.kind === "inProgress";
  const seconds = useDeadlineCountdown(inProgress ? state.retryAt : null);
  const title = inProgress
    ? IN_PROGRESS_TITLE
    : "처리 결과를 확인하지 못했습니다";
  const Heading = answer === undefined ? "h2" : "h3";
  const resendRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    // 기다리는 동안 사용자가 다른 곳에 초점을 옮겼다면 버튼으로 되돌리지 않는다.
    if (seconds === 0 && focusFrom?.current === document.activeElement)
      resendRef.current?.focus();
  }, [seconds, focusFrom]);

  return (
    <section className="recovery card" aria-labelledby={titleId}>
      <div
        className="recovery__message"
        role={inProgress ? undefined : "alert"}
      >
        <div className="recovery__heading">
          <Icon name={inProgress ? "refresh" : "alert"} size={20} />
          <Heading id={titleId}>{title}</Heading>
        </div>
        <p>
          {inProgress
            ? "대기 시간이 지나면 같은 요청의 상태를 다시 확인할 수 있습니다."
            : "같은 요청으로 상태를 다시 확인할 수 있습니다. 다시 확인한 뒤에도 처리 결과나 성공 여부가 불명확할 수 있습니다."}
        </p>
      </div>
      {answer !== undefined && <SentAnswer answer={answer} />}
      {inProgress && (
        <div className="recovery__wait">
          {seconds > 0 && (
            <p>{seconds}초 뒤에 같은 요청으로 확인할 수 있습니다.</p>
          )}
          {/* 초마다 안내하지 않고 버튼을 사용할 수 있게 될 때 한 번 알린다. */}
          <p
            role="status"
            className={seconds > 0 ? "visually-hidden" : undefined}
          >
            {seconds === 0 && "이제 같은 요청으로 확인할 수 있습니다."}
          </p>
        </div>
      )}
      {requestId && (
        <p className="muted small">
          요청 ID <span className="code">{requestId}</span>
        </p>
      )}
      <div className="search-actions">
        <button
          ref={resendRef}
          type="button"
          className="button"
          disabled={inProgress && seconds > 0}
          onClick={onResend}
        >
          <Icon name="refresh" size={16} />
          같은 요청으로 확인
        </button>
        {onRewrite && (
          <button
            type="button"
            className="button secondary"
            onClick={onRewrite}
          >
            질문 다시 쓰기
          </button>
        )}
      </div>
    </section>
  );
}
