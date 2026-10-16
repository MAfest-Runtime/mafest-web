import { useId, useState, type FormEvent } from "react";
import type { ConfirmPhase, EndReason } from "../lib/useConfirmSubmit";
import type { ConfirmationRequired } from "../lib/types";
import { Icon } from "./Icon";
import { useCountdown } from "../lib/useCountdown";

/** 글자 수는 서버(Python)와 같게 유니코드 코드 포인트로 센다. UTF-16 길이로 세면 이모지에서 어긋난다. */
function codePointLength(text: string): number {
  return [...text].length;
}

/** 답을 보낼 수 있는 상태에서만 입력을 연다. 그 밖에는 이미 보낸 답을 읽기 전용으로 보여 준다. */
type OpenPhase = Exclude<ConfirmPhase, { phase: "resumed" | "ended" }>;

/**
 * 기준 확인 화면. 원래 질문·이미 읽은 조건·확인할 기준은 서버가 준 값을 그대로 보여 준다.
 * 웹이 수치 기준이나 추천 문구를 만들어 넣지 않는다. 기본 기준으로 계속하는 동작도 없다.
 * 답은 원 질문에 이어 붙여 새로 검색하지 않고 세션으로 보낸다(부모가 onSubmit 을 부른다).
 */
export function ConfirmView({
  confirmation,
  state,
  onSubmit,
  onResend,
  onRewrite,
}: {
  confirmation: ConfirmationRequired;
  state: OpenPhase;
  onSubmit: (answer: string) => void;
  onResend: () => void;
  onRewrite: () => void;
}) {
  const [draft, setDraft] = useState("");
  const answerId = useId();
  const submitting = state.phase === "submitting";
  // 이미 보낸 답이 있으면(전송 불명·처리 중·제출 중) 그 답을 보여 주고 바꿀 수 없게 한다.
  // 답을 바꿔도 재전송은 처음 답을 보내므로, 바꿀 수 있는 것처럼 보이면 안 된다.
  const locked = state.phase !== "awaiting";
  const shown = locked ? state.request.answer : draft;
  const trimmed = draft.trim();
  const length = codePointLength(trimmed);
  const tooLong = length > confirmation.answer_max_length;
  const canAnswer = confirmation.actions.includes("answer_text");
  const canSubmit = !locked && trimmed !== "" && !tooLong;

  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit(trimmed);
  }

  return (
    <section className="confirm card" aria-labelledby={`${answerId}-title`}>
      <h2 id={`${answerId}-title`}>기준을 한 번 확인할게요</h2>
      <dl className="confirm__facts">
        <div>
          <dt>원래 질문</dt>
          <dd>{confirmation.original_question}</dd>
        </div>
        <div>
          <dt>이미 읽은 조건</dt>
          <dd>{confirmation.understood_conditions.join(" · ")}</dd>
        </div>
        <div>
          <dt>확인할 기준</dt>
          <dd>{confirmation.prompt}</dd>
        </div>
      </dl>

      {state.phase === "sendUnknown" && (
        <div className="banner banner--warn" role="alert">
          <Icon name="refresh" size={16} />
          <span>
            처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인할 수
            있지만, 결과 확인이나 성공을 보장하지 않습니다.
          </span>
          <button
            type="button"
            className="button button--small"
            onClick={onResend}
          >
            같은 요청으로 확인
          </button>
        </div>
      )}
      {state.phase === "inProgress" && (
        <InProgressNotice retryAfter={state.retryAfter} onResend={onResend} />
      )}

      <form className="confirm__form" onSubmit={submitAnswer}>
        {canAnswer && (
          <>
            <label htmlFor={answerId} className="confirm__label">
              답변 입력
            </label>
            <textarea
              id={answerId}
              className="confirm__input"
              rows={2}
              value={shown}
              readOnly={locked}
              disabled={submitting}
              aria-invalid={tooLong}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter 로 보내고, 줄바꿈은 Shift+Enter. 키 반복(길게 누름)은 무시한다.
                // 한글 조합 중의 Enter 는 글자를 확정하는 키라 제출로 쓰지 않는다. 브라우저에 따라 조합을
                // 확정하는 keydown 의 isComposing 이 false 로 오기도 해서 keyCode 229 도 함께 본다.
                const composing =
                  event.nativeEvent.isComposing || event.keyCode === 229;
                if (event.key === "Enter" && !event.shiftKey && !composing) {
                  event.preventDefault();
                  if (!event.repeat && canSubmit) onSubmit(trimmed);
                }
              }}
            />
            {!locked && (
              <p
                className={`confirm__count ${tooLong ? "confirm__count--over" : ""}`}
              >
                {length} / {confirmation.answer_max_length}자
                {tooLong && " — 줄여서 보내 주세요"}
              </p>
            )}
          </>
        )}
        <div className="confirm__actions">
          {canAnswer && (
            <button type="submit" className="button" disabled={!canSubmit}>
              {submitting ? "보내는 중" : "답변 보내기"}
            </button>
          )}
          <button
            type="button"
            className="button"
            disabled={submitting}
            onClick={onRewrite}
          >
            질문 다시 쓰기
          </button>
        </div>
      </form>
      <p className="muted confirm__note">
        이 확인은 이 화면에서만 이어집니다. 새로고침하거나 다시 검색하면 새로
        시작하며, 보낸 답은 저장되지 않습니다.
      </p>
    </section>
  );
}

/** 서버가 같은 요청을 아직 처리 중일 때. Retry-After 뒤에 사용자가 직접 같은 요청을 다시 보낸다. */
function InProgressNotice({
  retryAfter,
  onResend,
}: {
  retryAfter: number | null;
  onResend: () => void;
}) {
  const left = useCountdown(retryAfter);
  return (
    <div className="banner banner--warn" role="status">
      <Icon name="refresh" size={16} />
      <span>
        기존 요청을 처리하고 있습니다. {left > 0 ? `${left}초 뒤에` : "잠시 뒤"}{" "}
        같은 요청으로 상태를 확인할 수 있습니다. 새로 해석하지 않습니다.
      </span>
      <button
        type="button"
        className="button button--small"
        disabled={left > 0}
        onClick={onResend}
      >
        같은 요청으로 확인
      </button>
    </div>
  );
}

const END_MESSAGES: Record<EndReason, { title: string; body: string }> = {
  expired: {
    title: "확인 시간이 지났습니다",
    body: "확인 내용이 만료됐습니다. 새 검색으로 시작하면 이전에 보낸 답은 이어지지 않습니다.",
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
    body: "서버 응답을 확인할 수 없었습니다. 새 검색으로 시작하거나 질문을 다시 써 주세요.",
  },
};

/** 세션을 더 쓸 수 없을 때. 처음부터 다시 확인(새 검색·새 실행)하거나 질문을 다시 쓰게 한다. */
export function ConfirmEnded({
  reason,
  onRestart,
  onRewrite,
}: {
  reason: EndReason;
  onRestart: () => void;
  onRewrite: () => void;
}) {
  const message = END_MESSAGES[reason];
  return (
    <section className="confirm card" role="alert">
      <h2>{message.title}</h2>
      <p>{message.body}</p>
      <div className="confirm__actions">
        {reason !== "unsupported" && (
          <button type="button" className="button" onClick={onRestart}>
            새 검색으로 시작
          </button>
        )}
        <button type="button" className="button" onClick={onRewrite}>
          질문 다시 쓰기
        </button>
      </div>
    </section>
  );
}
