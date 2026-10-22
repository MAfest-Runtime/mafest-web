import { DOMAIN_LABEL, questionSegments } from "../lib/explain";
import type { StreamInterpretationDraft } from "../lib/types";
import { useElapsed } from "../lib/useElapsed";

/**
 * 최종 해석이 오기 전의 해석 미리보기. 모델이 먼저 고른 상품군 칩과, 질문에서 근거로 집은 구간을 보여 준다.
 *
 * 확정 전 값이라 틀릴 수 있다. 그래서 "확정 전" 표시(점선 밑줄)를 하고 번호·해석 결과는 붙이지 않는다.
 * 최종 해석(interpretation)이 오면 호출한 쪽이 이 자리를 InterpretationCard 로 바꾼다.
 *
 * `question` 은 start 이벤트의 질문이어야 한다 — draft 구간 위치가 그 문자열의 코드 포인트 기준이기 때문이다.
 * 스크린리더에는 요약 문장 하나만 읽히게 하고(draft 가 올 때마다 전체를 읽지 않도록) 나머지는 live 영역 밖에 둔다.
 */
export function InterpretationDraft({
  question,
  draft,
  startedAt,
}: {
  question: string;
  draft: StreamInterpretationDraft;
  startedAt: number;
}) {
  const elapsed = useElapsed(startedAt);
  const segments = questionSegments(question, draft.spans);
  return (
    <section
      className="interp interp--draft card"
      aria-labelledby="draft-heading"
    >
      <h2 id="draft-heading" className="interp__title">
        질문을 해석하는 중 <span className="num muted">· {elapsed}초</span>
      </h2>
      <p className="visually-hidden" role="status" aria-live="polite">
        상품군 {draft.domains.length}개, 질문 구간 {draft.spans.length}곳 확인
        중
      </p>

      <p className="interp__question">
        {segments.map((segment, i) =>
          segment.mapping === undefined ? (
            <span key={i}>{segment.text}</span>
          ) : (
            <mark key={i} className="qmark qmark--draft">
              {segment.text}
            </mark>
          ),
        )}
      </p>

      {draft.domains.length > 0 && (
        <ul className="chips" aria-label="확인 중인 상품군">
          {draft.domains.map((key) => (
            <li className="chip chip--domain" key={key}>
              {DOMAIN_LABEL[key]}
            </li>
          ))}
        </ul>
      )}
      <p className="muted interp__draft-note">
        아직 확정 전입니다. 점선 밑줄은 읽고 있는 표현이고, 최종 해석에서 바뀔
        수 있습니다.
      </p>
    </section>
  );
}
