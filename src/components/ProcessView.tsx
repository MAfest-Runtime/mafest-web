import { buildPipeline, timingSegments } from "../lib/explain";
import { formatCount, formatMs } from "../lib/format";
import type { ProcessPresentation } from "../lib/searchPresentation";
import type { TraceStage } from "../lib/types";
import { Stepper } from "./Stepper";

const STAGE_LABEL: Record<TraceStage, string> = {
  route: "라우팅",
  llm_parse: "AI 해석",
  query: "조회",
  compute: "연산",
  gate: "게이트",
  verify: "검증",
  generate: "생성",
  suggest: "후속 질문",
  render: "렌더",
};

/**
 * "어떻게 답했나". 접지 않고 항상 보인다(설계한 처리 단계를 드러내는 자리).
 * 위: 5단계 표시(해석→조회→판정→생성→검증) + 판정 설명, 가운데: 단계별 시간 막대,
 * 아래(접힘): 서버가 준 세부 기록과, 공개 설정일 때만 오는 쿼리 원문.
 */
export function ProcessView({ response }: { response: ProcessPresentation }) {
  const { trace } = response;
  const pipeline = buildPipeline(response);
  const segments = timingSegments(pipeline);
  const meta = [
    pipeline.totalMs !== null ? `총 ${formatMs(pipeline.totalMs)}` : null,
    trace.model,
    trace.tokens
      ? `토큰 ${formatCount(trace.tokens.prompt)} → ${formatCount(trace.tokens.completion)}`
      : null,
  ].filter(Boolean);

  return (
    <section className="process card" aria-labelledby="process-heading">
      <header className="process__head">
        <h2 id="process-heading">어떻게 답했나</h2>
        <span className="process__meta">{meta.join(" · ")}</span>
      </header>

      <Stepper steps={pipeline.steps} label="처리 단계" />

      {segments.length > 1 && (
        <div className="timing">
          <div
            className="timing__bar"
            role="img"
            aria-label={`단계별 시간: ${segments
              .map((s) => `${s.label} ${formatMs(s.ms)}`)
              .join(", ")}`}
          >
            {segments.map((s) => (
              <span
                key={s.key}
                className={`timing__seg timing__seg--${s.key}`}
                style={{ flexGrow: s.ratio }}
              />
            ))}
          </div>
          <ul className="timing__legend" aria-hidden="true">
            {segments.map((s) => (
              <li key={s.key}>
                <span className={`timing__swatch timing__seg--${s.key}`} />
                {s.label} <span className="num">{formatMs(s.ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="process__raw">
        <summary>세부 기록</summary>
        <ol className="raw-steps">
          {trace.steps.map((step, index) => (
            <li key={`${step.stage}-${index}`}>
              <div className="raw-steps__line">
                <span>
                  <span className="raw-steps__stage">
                    {STAGE_LABEL[step.stage] ?? step.stage}
                  </span>
                  {step.detail && (
                    <span className="muted"> · {step.detail}</span>
                  )}
                </span>
                <span className="num muted">{formatMs(step.ms)}</span>
              </div>
              {step.query && (
                <pre className="trace__query">
                  <code>{step.query}</code>
                </pre>
              )}
            </li>
          ))}
        </ol>
        <p className="process__foot">
          요청 ID <span className="code">{response.request_id}</span>
          <br />
          조회는 읽기 전용 계정으로 실행됩니다. 쿼리가 보일 때는 자리표시자만
          나오고 매개변수 값은 넣지 않습니다.
        </p>
      </details>
    </section>
  );
}
