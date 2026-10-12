import { useState } from "react";
import type { Concepts } from "../lib/useConcepts";
import type { ConceptTopic } from "../lib/types";
import { Icon } from "./Icon";

/** 이 영역이 특정 상품의 안전성·적합성 판단이 아니라는 표시. 주제가 있을 때만 그린다. */
const SCOPE_NOTE =
  "일반적인 개념 설명입니다. 위 조회 결과나 특정 상품에 대한 평가·추천이 아닙니다.";

/**
 * "알아두면 좋은 개념". 일반 개념 설명이며 위 표의 조회 근거가 아니다.
 * - 주제가 없으면(실패·근거 없음 포함) 아무것도 그리지 않는다. 빈 카드나 안내 문구를 내지 않는다.
 * - 설명과 출처 제목·주소·검토일은 서버 값을 그대로 쓴다. 웹이 정의나 출처 이름을 만들지 않는다.
 *   웹이 쓰는 안내 문장은 아래 `SCOPE_NOTE` 하나뿐이며, 설명이 아니라 이 영역의 성격(일반 설명, 상품 평가 아님)을 알린다.
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
      <p className="concepts__note muted">{SCOPE_NOTE}</p>
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
