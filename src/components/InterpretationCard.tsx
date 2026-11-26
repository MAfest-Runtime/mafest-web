import { useMappingFocus } from "../lib/citeFocus";
import {
  domainViews,
  interpretationSentence,
  METHOD_LABEL,
  questionSegments,
  SLOT_LABEL,
  type DomainViewInput,
} from "../lib/explain";
import { formatCount } from "../lib/format";

/**
 * 질문 해석. 두 가지를 보여준다.
 *   1) 해석 과정: 질문의 어느 표현을 → 무엇으로(대상·조건·정렬·개수…) → 어떤 장치로
 *      (사전 일치·패턴·규칙·기본값) 읽었는가. 질문에 밑줄과 번호, 아래 목록이 같은 번호로 잇는다.
 *   2) 해석 결과: 한 문장 요약과 상품군별 상태(찾음·일부만·장애…).
 * 해석 과정(r6 `interpretation.mappings`)이 비어 있으면 결과만 칩으로 보여준다.
 *
 * 결과 위 필터 UI는 두지 않는다 — 조건을 바꾸려면 질문을 고친다(37 4-2).
 */
export function InterpretationCard({
  response,
}: {
  response: DomainViewInput & { question: string };
}) {
  const it = response.interpretation;
  const { active, setActive } = useMappingFocus();
  const hasMappings = it.mappings.length > 0;
  if (
    !hasMappings &&
    it.domains.length === 0 &&
    it.conditions.length === 0 &&
    !it.sort
  )
    return null;

  const sentence = interpretationSentence(it);
  const domains = domainViews(response);
  const segments = questionSegments(response.question, it.mappings);
  const hover = (index: number | null) => () => setActive(index);

  return (
    <section className="interp card" aria-labelledby="interp-heading">
      <h2 id="interp-heading" className="interp__title">
        질문 해석
      </h2>

      {hasMappings && (
        <>
          <p className="interp__question">
            {segments.map((segment, i) =>
              segment.mapping === undefined ? (
                <span key={i}>{segment.text}</span>
              ) : (
                <mark
                  key={i}
                  className={`qmark slot--${it.mappings[segment.mapping].slot}`}
                  data-active={active === segment.mapping || undefined}
                  onMouseEnter={hover(segment.mapping)}
                  onMouseLeave={hover(null)}
                >
                  <span className="qmark__num" aria-hidden="true">
                    {segment.mapping + 1}
                  </span>
                  {segment.text}
                </mark>
              ),
            )}
          </p>

          <ol className="mapping-list" aria-label="해석 과정">
            {it.mappings.map((m, i) => (
              <li
                key={i}
                className={`mapping slot--${m.slot}`}
                data-active={active === i || undefined}
                onMouseEnter={hover(i)}
                onMouseLeave={hover(null)}
              >
                <span className="mapping__num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="mapping__src">
                  {m.text !== null ? (
                    <q>{m.text}</q>
                  ) : (
                    <span className="muted">질문에 없음</span>
                  )}
                </span>
                <span className="mapping__to">
                  <span className="mapping__arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="visually-hidden">해석: </span>
                  <span className="mapping__slot">{SLOT_LABEL[m.slot]}</span>
                  <span className="mapping__result">{m.result}</span>
                </span>
                <span className="mapping__how">
                  <span className={`method method--${m.method}`}>
                    {METHOD_LABEL[m.method] ?? m.method}
                  </span>
                  {m.note && <span className="mapping__note">{m.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {sentence && (
        <p className="interp__sentence">
          <span className="interp__sentence-label">해석 결과</span>
          {sentence}
        </p>
      )}

      {!hasMappings && (
        <ul className="chips" aria-label="해석한 조건">
          {it.conditions.map((c) => (
            <li className="chip" key={`${c.axis}-${c.op}-${String(c.value)}`}>
              {c.display}
            </li>
          ))}
          {it.sort && (
            <li className="chip chip--strong">
              {it.sort.label} {it.sort.dir === "desc" ? "↓" : "↑"}
            </li>
          )}
          {it.limit !== null && <li className="chip">상위 {it.limit}</li>}
        </ul>
      )}

      {domains.length > 0 && (
        <ul className="domain-list" aria-label="상품군 상태">
          {domains.map((d) => (
            <li key={d.domain.domain} className={`domain-pill tone--${d.tone}`}>
              <span className="domain-pill__dot" aria-hidden="true" />
              <span className="domain-pill__name">{d.domain.label}</span>
              <span className="domain-pill__status">{d.label}</span>
              {d.count !== null && (
                <span className="domain-pill__meta num">
                  {formatCount(d.count)}건
                </span>
              )}
              {d.domain.base_date && (
                <span className="domain-pill__meta">
                  <span className="visually-hidden">기준일 </span>
                  <time dateTime={d.domain.base_date}>
                    {d.domain.base_date}
                  </time>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
