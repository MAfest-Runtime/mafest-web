import { useState } from "react";
import type { Concepts } from "../lib/useConcepts";
import type { ConceptTopic } from "../lib/types";
import { Icon } from "./Icon";

/**
 * "알아두면 좋은 개념". 일반 개념 설명이며 위 표의 조회 근거가 아니다.
 * - 주제가 없으면(실패·근거 없음 포함) 아무것도 그리지 않는다. 빈 카드나 안내 문구를 내지 않는다.
 * - 로딩 중에는 작은 자리 표시만 둔다. 위의 요약·표를 가리거나 밀어내지 않는다.
 * - 상세 설명은 응답에 이미 있으므로 펼쳐도 요청을 보내지 않는다.
 * - 문장은 텍스트로만 그린다(HTML·마크다운·자동 링크 해석 없음). 링크는 검증을 통과한 출처 주소뿐이다.
 */
export function ConceptCards({ concepts }: { concepts: Concepts }) {
  if (concepts.topics.length === 0) {
    return concepts.loading ? (
      <section className="concepts concepts--loading" aria-busy="true">
        <p className="concepts__title">알아두면 좋은 개념</p>
        <p className="muted" role="status">
          관련 개념을 찾고 있습니다.
        </p>
      </section>
    ) : null;
  }
  return (
    <section className="concepts" aria-labelledby="concepts-heading">
      <h2 id="concepts-heading" className="concepts__title">
        알아두면 좋은 개념
      </h2>
      <ul className="concepts__list">
        {concepts.topics.map((topic) => (
          <li key={topic.id}>
            <ConceptCard topic={topic} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConceptCard({ topic }: { topic: ConceptTopic }) {
  const [open, setOpen] = useState(false);
  const panel = `concept-detail-${topic.id}`;
  return (
    <article className="card concept" aria-label={topic.title}>
      <h3 className="concept__title">{topic.title}</h3>
      <p className="concept__summary">{topic.summary}</p>
      <button
        type="button"
        className="concept__toggle"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="arrow" size={14} />
        {open ? "접기" : "자세히 보기"}
      </button>
      {open && (
        <div id={panel} className="concept__detail">
          <p>{topic.detail}</p>
          <ul className="concept__sources" aria-label="출처">
            {topic.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
          <p className="concept__reviewed muted">검토일 {topic.reviewed_at}</p>
        </div>
      )}
    </article>
  );
}
