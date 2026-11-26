import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { EndReason, RunState } from "../lib/useSearchRun";
import { PendingRecovery, SentAnswer } from "./PendingRecovery";

function RewriteButton({
  onRewrite,
  secondary,
}: {
  onRewrite: () => void;
  secondary: boolean;
}) {
  return (
    <button
      type="button"
      className={secondary ? "button secondary" : "button"}
      onClick={onRewrite}
    >
      질문 다시 쓰기
    </button>
  );
}

function AnswerForm({
  maxLength,
  onSubmit,
  onRewrite,
}: {
  maxLength: number;
  onSubmit: (answer: string) => void;
  onRewrite: () => void;
}) {
  const [draft, setDraft] = useState("");
  const answerId = useId();
  const countId = useId();
  const trimmed = draft.trim();
  // 서버와 같은 유니코드 코드 포인트 단위로 센다. 이모지도 글자 하나로 센다.
  const length = [...trimmed].length;
  const tooLong = length > maxLength;
  const canSubmit = length > 0 && !tooLong;

  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit(trimmed);
  }

  return (
    <form className="confirm__form" onSubmit={submitAnswer}>
      <label htmlFor={answerId} className="confirm__label">
        답변 입력
      </label>
      <textarea
        id={answerId}
        className="confirm__input"
        rows={3}
        value={draft}
        aria-describedby={countId}
        aria-invalid={tooLong}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // 일부 브라우저는 한글을 확정하는 Enter 에 isComposing 대신 keyCode 229 를 보낸다.
          const composing =
            event.nativeEvent.isComposing || event.keyCode === 229;
          if (event.key === "Enter" && !event.shiftKey && !composing) {
            event.preventDefault();
            if (!event.repeat && canSubmit) onSubmit(trimmed);
          }
        }}
      />
      <p
        id={countId}
        className={`confirm__count ${tooLong ? "confirm__count--over" : ""}`}
      >
        {length} / {maxLength}자{tooLong && " · 줄여서 보내 주세요"}
      </p>
      <div className="search-actions">
        <button type="submit" className="button" disabled={!canSubmit}>
          답변 보내기
        </button>
        <RewriteButton onRewrite={onRewrite} secondary />
      </div>
    </form>
  );
}

/** 서버가 보낸 확인 질문을 먼저 보여 준다. 답을 보낸 뒤에는 같은 요청의 답을 그대로 읽을 수 있다. */
export function ConfirmView({
  state,
  onSubmit,
  onResend,
  onRestart,
  onRewrite,
}: {
  state: Extract<RunState, { status: "confirm" | "confirmEnded" }>;
  onSubmit: (answer: string) => void;
  onResend: () => void;
  onRestart: () => void;
  onRewrite: () => void;
}) {
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const promptRef = useRef<HTMLHeadingElement>(null);
  const endedButtonRef = useRef<HTMLButtonElement>(null);
  const ended =
    state.status === "confirmEnded" ? END_MESSAGES[state.reason] : null;
  const confirmation = state.status === "confirm" ? state.confirmation : null;
  const phase = state.status === "confirm" ? state.phase : null;
  const canRestart = state.status === "confirmEnded" && state.canRestart;

  useLayoutEffect(() => {
    if (ended && promptRef.current === document.activeElement)
      endedButtonRef.current?.focus();
  }, [ended]);

  // 누른 버튼이나 입력창은 전송 중 사라진다. 사용자가 영역 안에 있을 때만 초점을 확인 질문에 남긴다.
  function keepFocusInConfirmation() {
    if (sectionRef.current?.contains(document.activeElement))
      promptRef.current?.focus({ preventScroll: true });
  }

  return (
    <section
      ref={sectionRef}
      className="confirm card"
      aria-labelledby={titleId}
    >
      <div className="confirm__header" role={ended ? "alert" : undefined}>
        {confirmation && <p className="confirm__kind">기준 확인</p>}
        <h2
          ref={promptRef}
          id={titleId}
          className="confirm__prompt"
          tabIndex={-1}
        >
          {confirmation?.prompt ?? ended?.title}
        </h2>
        {ended && <p>{ended.body}</p>}
      </div>

      {ended && (
        <div className="search-actions">
          <button
            ref={endedButtonRef}
            type="button"
            className="button"
            onClick={canRestart ? onRestart : onRewrite}
          >
            {canRestart ? "새 검색으로 시작" : "질문 다시 쓰기"}
          </button>
          {canRestart && <RewriteButton onRewrite={onRewrite} secondary />}
        </div>
      )}

      {confirmation &&
        phase?.phase === "awaiting" &&
        (confirmation.canAnswer ? (
          <AnswerForm
            maxLength={confirmation.answer_max_length}
            onSubmit={(answer) => {
              keepFocusInConfirmation();
              onSubmit(answer);
            }}
            onRewrite={onRewrite}
          />
        ) : (
          <div className="search-actions">
            <RewriteButton onRewrite={onRewrite} secondary={false} />
          </div>
        ))}
      {phase?.phase === "submitting" && (
        <>
          <SentAnswer answer={phase.answer} />
          <p className="muted">보내는 중</p>
        </>
      )}
      {(phase?.phase === "sendUnknown" || phase?.phase === "inProgress") && (
        <PendingRecovery
          state={
            phase.phase === "inProgress"
              ? { kind: "inProgress", retryAt: phase.retryAt }
              : { kind: "unknown" }
          }
          answer={phase.answer}
          focusFrom={promptRef}
          onResend={() => {
            keepFocusInConfirmation();
            onResend();
          }}
          onRewrite={onRewrite}
        />
      )}

      {confirmation && (
        <>
          <dl className="confirm__facts">
            <div>
              <dt>원래 질문</dt>
              <dd>{confirmation.original_question}</dd>
            </div>
            <div>
              <dt>이미 읽은 조건</dt>
              <dd>
                {confirmation.understood_conditions.join(" · ") || "없음"}
              </dd>
            </div>
          </dl>
          <p className="muted confirm__note">
            이 확인은 이 화면에서만 이어집니다. 새로고침하거나 다시 검색하면
            새로 시작하며, 보낸 답은 저장되지 않습니다.
          </p>
        </>
      )}
    </section>
  );
}

const END_MESSAGES: Record<EndReason, { title: string; body: string }> = {
  expired: {
    title: "확인 시간이 지났습니다",
    body: "확인 세션이 만료됐습니다. 새 검색으로 시작한 뒤 기준을 다시 입력해 주세요.",
  },
  conflict: {
    title: "확인 내용이 바뀌었습니다",
    body: "다른 곳에서 이미 처리됐을 수 있습니다. 새 검색으로 시작해 주세요.",
  },
  indeterminate: {
    title: "이 요청은 더 이어갈 수 없습니다",
    body: "새 검색으로 시작해 주세요.",
  },
  unsupported: {
    title: "기준 확인을 지원하지 않습니다",
    body: "질문을 다시 써서 검색해 주세요.",
  },
  failed: {
    title: "답변을 처리하지 못했습니다",
    body: "새 검색으로 시작하거나 질문을 다시 써 주세요.",
  },
};
