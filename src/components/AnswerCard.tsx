import { rowDomId, useCiteFocus } from "../lib/citeFocus";
import { linkAnswer, type CiteTarget } from "../lib/explain";
import { baseDateSummary, GENERATED_LABEL } from "../lib/format";
import type { DisplayedAnswer } from "../lib/searchPresentation";
import type { InterpretedDomain, ResultGroup } from "../lib/types";
import { Icon } from "./Icon";

/** 기준일 배지. 상품군마다 다르면 나열한다. */
export function BaseDates({ domains }: { domains: InterpretedDomain[] }) {
  const dates = baseDateSummary(domains);
  if (dates.length === 0) return null;
  return (
    <span className="base-dates">
      {dates.map(({ label, date }) => (
        <span className="badge badge--plain" key={`${label}-${date}`}>
          {label ? `${label} ` : ""}기준일 <time dateTime={date}>{date}</time>
        </span>
      ))}
    </span>
  );
}

/**
 * 답변 문장. 서버 문장은 텍스트 그대로 그린다(Markdown·HTML 해석 안 함).
 * 내부 대체 경로는 배지로 알리지 않으며, AI 생성 문장으로도 표시하지 않는다.
 */
export function AnswerCard({
  answer,
  caveat,
  domains,
  results,
}: {
  answer: DisplayedAnswer;
  caveat: boolean;
  domains: InterpretedDomain[];
  results: ResultGroup[];
}) {
  const completed = answer.kind === "complete" ? answer.answer : null;
  return (
    <section className="answer card" aria-labelledby="answer-heading">
      <header className="answer__head">
        <h2 id="answer-heading">답변</h2>
        <span className="answer__badges">
          {caveat && (
            <span className="badge badge--warn">
              <Icon name="alert" size={14} />
              주의
            </span>
          )}
          {completed && completed.generated_by !== "fallback" && (
            <span className="badge badge--plain">
              {GENERATED_LABEL[completed.generated_by]}
            </span>
          )}
          <BaseDates domains={domains} />
        </span>
      </header>
      {answer.kind === "writing" ? (
        <StreamingText
          sentences={answer.sentences}
          retrying={answer.retrying}
        />
      ) : (
        <AnswerText text={answer.answer.text} results={results} />
      )}
      {completed && completed.notices.length > 0 && (
        <ul
          className={`notices ${caveat ? "notices--warn" : ""}`}
          aria-label={caveat ? "주의 사유" : "안내"}
        >
          {completed.notices.map((notice) => (
            <li key={notice.code + notice.text}>
              <Icon name={caveat ? "alert" : "info"} size={15} />
              <span>{notice.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 스트리밍 중 답변 문장. 문장마다 노드를 하나씩 덧붙여서, 스크린 리더가 새 문장만 읽게 한다(aria-live=polite).
 * 아직 문장이 없으면 자리를 잡는 안내 한 줄을 둔다. 인용 연결은 done 에서 cited 가 확정된 뒤에 생긴다.
 */
function StreamingText({
  sentences,
  retrying,
}: {
  sentences: string[];
  retrying: boolean;
}) {
  return (
    <p
      className="answer__text answer__text--streaming"
      aria-live="polite"
      aria-atomic="false"
      aria-busy="true"
    >
      {sentences.length === 0 && !retrying ? (
        <span className="answer__pending">답변 문장을 만들고 있습니다.</span>
      ) : (
        sentences.map((sentence, index) => (
          <span key={index} className="answer__sentence">
            {sentence}{" "}
          </span>
        ))
      )}
    </p>
  );
}

/**
 * 답변 문장. 인용 상품의 이름과 숫자가 표의 값과 정확히 같으면 밑줄로 잇는다.
 * 마우스·키보드 초점을 주면 표의 그 칸이 강조되고, 누르면 그 행으로 스크롤한다.
 */
function AnswerText({
  text,
  results,
}: {
  text: string;
  results: ResultGroup[];
}) {
  const { focus, setFocus } = useCiteFocus();
  const segments = linkAnswer(text, results);
  const linked = segments.some((s) => s.cite);
  const same = (a: CiteTarget | null, b: CiteTarget) =>
    a !== null &&
    a.domain === b.domain &&
    a.productId === b.productId &&
    a.key === b.key;

  return (
    <>
      <p className="answer__text">
        {segments.map((segment, index) =>
          segment.cite ? (
            <button
              key={index}
              type="button"
              className="cite-link"
              data-active={same(focus, segment.cite) || undefined}
              aria-describedby="cite-hint"
              onMouseEnter={() => setFocus(segment.cite)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(segment.cite)}
              onBlur={() => setFocus(null)}
              onClick={() => {
                const row = document.getElementById(
                  rowDomId(segment.cite.domain, segment.cite.productId),
                );
                row?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              {segment.text}
            </button>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </p>
      {linked && (
        <p id="cite-hint" className="answer__hint">
          밑줄 친 값은 아래 표에서 그대로 가져온 값입니다. 누르면 그 상품으로
          이동합니다.
        </p>
      )}
    </>
  );
}
