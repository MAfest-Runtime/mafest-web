import { formatCount, isNumeric } from "./format";
import { graphLayers } from "./graphLayout";
import type {
  DomainKey,
  EntityType,
  EvidenceStatus,
  GraphNode,
  GraphState,
  Interpretation,
  InterpretationMapping,
  InterpretedDomain,
  MappingMethod,
  MappingSlot,
  Outcome,
  ResultGroup,
  SearchGraph,
  SearchResponse,
  TraceStage,
} from "./types";

/** 공개 도메인 키의 화면 라벨. 해석 미리보기 칩과 mock 픽스처가 같은 이름을 쓴다. */
export const DOMAIN_LABEL: Record<DomainKey, string> = {
  bond: "채권",
  kr_etf: "국내 ETF",
  kr_etn: "국내 ETN",
  xx_etf: "해외 ETF",
  xx_etn: "해외 ETN",
  fund: "공모펀드",
};

/**
 * "어떻게 답했나"를 그리기 위한 파생 값. 화면 컴포넌트가 응답을 직접 해석하지 않도록
 * 규칙을 여기 한곳에 모은다(단위 테스트는 persona-ops-lab의 mafest-web 묶음에 있다).
 *
 * 전부 **이미 응답에 있는 필드**에서만 만든다(39 r5 계약 변경 없음). 서버가 명시하지
 * 않은 것(단계별 상태, 장애 여부)은 outcome·notice·trace detail로 추정하며, 그 추정은
 * 명세 r6(steps[].status, domains[].absent_kind)이 생기면 그 값으로 바꾼다.
 */

// ---------------------------------------------------------------------------
// 상품군 상태

export type Tone = "ok" | "warn" | "muted" | "danger" | "info";

export interface DomainView {
  domain: InterpretedDomain;
  label: string;
  tone: Tone;
  /** 결과 표의 전체 건수. 표가 없으면 null. */
  count: number | null;
}

const STATUS_VIEW: Record<EvidenceStatus, { label: string; tone: Tone }> = {
  FOUND: { label: "찾음", tone: "ok" },
  PARTIAL: { label: "일부만", tone: "warn" },
  EMPTY: { label: "없음", tone: "muted" },
  AXIS_ABSENT: { label: "수집 안 함", tone: "muted" },
  AMBIGUOUS: { label: "확인 필요", tone: "info" },
};

/**
 * AXIS_ABSENT는 "수집 범위 밖"(영구)과 "장애"(일시)를 함께 담는다. 계약에 absent_kind가
 * 없으므로 outcome=unavailable이거나 STORE_BLOCKED notice가 그 상품군을 가리키면 장애로 본다.
 */
function isBlocked(response: SearchResponse, d: InterpretedDomain): boolean {
  if (d.status !== "AXIS_ABSENT") return false;
  if (response.outcome === "unavailable") return true;
  return response.answer.notices.some(
    (n) => n.code === "STORE_BLOCKED" && n.text.includes(d.label),
  );
}

export function domainViews(response: SearchResponse): DomainView[] {
  return response.interpretation.domains.map((d) => {
    const group = response.results.find((g) => g.domain === d.domain);
    if (isBlocked(response, d))
      return { domain: d, label: "장애", tone: "danger", count: null };
    const view = STATUS_VIEW[d.status];
    return {
      domain: d,
      label: view.label,
      tone: view.tone,
      count: group ? group.total_count : null,
    };
  });
}

// ---------------------------------------------------------------------------
// 해석 문장

/** 비율·금리·등급 축은 "높은/낮은", 금액·개수 축은 "큰/작은"이 자연스럽다. */
function sortPhrase(label: string, dir: "asc" | "desc"): string {
  const rate = /률|율|금리|보수|등급|수익/.test(label);
  if (rate) return `${label} ${dir === "desc" ? "높은" : "낮은"} 순`;
  return `${label} ${dir === "desc" ? "큰" : "작은"} 순`;
}

/**
 * 해석 결과를 한 문장으로 다시 쓴다. "내 말을 이렇게 알아들었구나"를 확인시키는 문장이다.
 * 예: "국내 ETF·국내 ETN 중 퇴직연금 가능, 총보수 < 0.2%인 상품을 순자산 큰 순으로 10개"
 * 상품군이 없으면(정책 거절 등) null.
 */
export function interpretationSentence(it: Interpretation): string | null {
  if (it.domains.length === 0) return null;
  const parts: string[] = [`${it.domains.map((d) => d.label).join("·")} 중`];
  if (it.conditions.length > 0)
    parts.push(`${it.conditions.map((c) => c.display).join(", ")}인 상품을`);
  else parts.push("상품을");
  if (it.sort) parts.push(`${sortPhrase(it.sort.label, it.sort.dir)}으로`);
  if (it.limit !== null) parts.push(`${it.limit}개`);
  else if (!it.sort) parts.push("찾기");
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// 처리 단계

export type StepKey = "route" | "query" | "gate" | "generate" | "verify";
export type StepState = "done" | "warn" | "stopped" | "failed" | "skipped";

export interface StepView {
  key: StepKey;
  label: string;
  state: StepState;
  ms: number | null;
  /** 서버가 준 한 줄 요약(trace detail). */
  detail: string | null;
  /** 이 단계가 왜 이 상태인지, 화면이 덧붙이는 설명. */
  note: string | null;
}

export const STEP_LABEL: Record<StepKey, string> = {
  route: "해석",
  query: "조회",
  gate: "판정",
  generate: "생성",
  verify: "검증",
};

/** 화면의 5단계 ← trace stage. compute는 조회에, render는 표시하지 않는다. */
const STAGE_TO_STEP: Partial<Record<TraceStage, StepKey>> = {
  route: "route",
  query: "query",
  compute: "query",
  gate: "gate",
  generate: "generate",
  verify: "verify",
};

/** 판정 단계 한 줄 설명. 게이트가 무엇을 근거로 LLM을 부르거나 막았는지 보여준다. */
export const GATE_HEADLINE: Record<Outcome, string> = {
  answered: "근거 충분 → 문장 생성",
  caveat: "일부만 근거 있음 → 주의와 함께 답함",
  no_result: "조건에 맞는 근거 없음 → 정해진 문장",
  not_collected: "수집하지 않은 항목 → 정해진 문장",
  unread: "질문 일부를 읽지 못함 → 다시 물을 질문 제시",
  unavailable: "데이터 저장소 장애 → 정해진 문장",
  ambiguous: "조건이 모호함 → 선택지 제시",
  refused: "정책상 답하지 않는 질문 → 거절",
  error: "처리 중 오류",
};

export interface Pipeline {
  steps: StepView[];
  headline: string;
  totalMs: number | null;
}

export function buildPipeline(response: SearchResponse): Pipeline {
  const { outcome, trace } = response;
  const merged = new Map<StepKey, { ms: number; details: string[] }>();
  for (const step of trace?.steps ?? []) {
    const key = STAGE_TO_STEP[step.stage];
    if (!key) continue;
    const entry = merged.get(key) ?? { ms: 0, details: [] };
    entry.ms += step.ms;
    if (step.detail) entry.details.push(step.detail);
    merged.set(key, entry);
  }

  const llmCalled = merged.has("generate");
  const generatedBy = response.answer.generated_by;
  const keys: StepKey[] = ["route", "query", "gate", "generate", "verify"];

  const steps = keys.map((key): StepView => {
    const entry = merged.get(key);
    const base: StepView = {
      key,
      label: STEP_LABEL[key],
      state: entry ? "done" : "skipped",
      ms: entry ? entry.ms : null,
      detail: entry ? entry.details.join(" · ") : null,
      note: null,
    };

    switch (key) {
      case "route":
        if (outcome === "refused") {
          base.state = "stopped";
          base.note = GATE_HEADLINE.refused;
        }
        break;
      case "query":
        if (!entry) {
          base.note =
            outcome === "refused" || outcome === "ambiguous"
              ? "조회 전에 멈춤"
              : null;
        } else if (outcome === "unavailable" || /실패/.test(base.detail ?? ""))
          base.state = outcome === "unavailable" ? "failed" : "warn";
        break;
      case "gate":
        if (!entry) break;
        if (outcome === "caveat") base.state = "warn";
        else if (outcome !== "answered") base.state = "stopped";
        base.note = GATE_HEADLINE[outcome];
        break;
      case "generate":
        if (generatedBy === "fallback") {
          base.state = "warn";
          base.note = "모델 응답 없음 · 표만 보여줌";
        } else if (!llmCalled) {
          base.note =
            outcome === "refused"
              ? "모델 호출 안 함"
              : "모델 호출 안 함 · 정해진 문장";
        }
        break;
      case "verify":
        if (!entry) base.note = llmCalled ? null : "검증할 생성 문장 없음";
        break;
    }
    return base;
  });

  // 오류: 기록이 남은 마지막 단계를 실패로 표시한다.
  if (outcome === "error") {
    const last = [...steps].reverse().find((s) => s.state !== "skipped");
    if (last) last.state = "failed";
  }

  return {
    steps,
    headline: GATE_HEADLINE[outcome],
    totalMs: trace ? trace.elapsed_ms : null,
  };
}

/** 시간 막대: 단계별 소요 비율. 기록이 없거나 합이 0이면 빈 배열. */
export function timingSegments(
  pipeline: Pipeline,
): Array<{ key: StepKey; label: string; ms: number; ratio: number }> {
  const timed = pipeline.steps.filter(
    (s): s is StepView & { ms: number } => s.ms !== null && s.ms > 0,
  );
  const total = timed.reduce((sum, s) => sum + s.ms, 0);
  if (total === 0) return [];
  return timed.map((s) => ({
    key: s.key,
    label: s.label,
    ms: s.ms,
    ratio: s.ms / total,
  }));
}

// ---------------------------------------------------------------------------
// 답변 문장의 근거 연결

export interface CiteTarget {
  domain: string;
  productId: string;
  /** 숫자 값이면 열 키, 상품명이면 null. */
  key: string | null;
}

export type AnswerSegment =
  | { text: string; cite?: undefined }
  | { text: string; cite: CiteTarget };

/**
 * 답변 문장에서 인용 상품의 이름과 숫자 표시값(예: "9.1조 원", "0.15%")을 찾아
 * 표의 그 행·칸과 잇는다. 서버가 위치를 주지 않으므로(r6 `answer.citations` 전까지)
 * 문자열이 정확히 같을 때만 잇는다 — 못 찾으면 그냥 글자로 둔다.
 */
export function linkAnswer(
  text: string,
  groups: ResultGroup[],
): AnswerSegment[] {
  const needles: Array<{ needle: string; cite: CiteTarget }> = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (!row.cited) continue;
      needles.push({
        needle: row.name,
        cite: { domain: group.domain, productId: row.product_id, key: null },
      });
      for (const column of group.columns) {
        if (!isNumeric(column.kind)) continue;
        const value = row.values[column.key];
        if (!value || value.src === "unavailable") continue;
        const display = value.display.replace(/^\+/, "");
        if (display.length < 3) continue;
        needles.push({
          needle: display,
          cite: {
            domain: group.domain,
            productId: row.product_id,
            key: column.key,
          },
        });
      }
    }
  }
  // 긴 것부터 맞춰야 "9.1조 원"이 "1조 원" 같은 짧은 값에 먹히지 않는다.
  needles.sort((a, b) => b.needle.length - a.needle.length);

  const taken: Array<{ start: number; end: number; cite: CiteTarget }> = [];
  for (const { needle, cite } of needles) {
    let from = 0;
    while (from <= text.length) {
      const at = text.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      const overlaps = taken.some((t) => at < t.end && end > t.start);
      if (!overlaps) {
        taken.push({ start: at, end, cite });
        break; // 같은 값은 첫 등장만 잇는다.
      }
      from = at + 1;
    }
  }
  taken.sort((a, b) => a.start - b.start);

  const segments: AnswerSegment[] = [];
  let cursor = 0;
  for (const t of taken) {
    if (t.start > cursor) segments.push({ text: text.slice(cursor, t.start) });
    segments.push({ text: text.slice(t.start, t.end), cite: t.cite });
    cursor = t.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

// ---------------------------------------------------------------------------
// 해석 과정(r6 interpretation.mappings)

export const SLOT_LABEL: Record<MappingSlot, string> = {
  domain: "대상",
  condition: "조건",
  sort: "정렬",
  limit: "개수",
  aggregate: "집계",
  entity: "이름",
  time: "시점",
  policy: "정책",
};

export const METHOD_LABEL: Record<MappingMethod, string> = {
  synonym: "사전 일치",
  pattern: "패턴",
  rule: "규칙",
  entity: "이름 사전",
  default: "기본값",
  llm: "AI 해석",
};

export type QuestionSegment =
  | { text: string; mapping?: undefined }
  | { text: string; mapping: number };

/** code point 위치 → JS 문자열(UTF-16) 위치. 한글·영문은 같고, 이모지 같은 문자만 다르다. */
function toUtf16(question: string, codePoint: number): number {
  return [...question].slice(0, codePoint).join("").length;
}

/**
 * 질문 속 구간을 가리키는 값. 최종 해석의 mapping 과 해석 미리보기의 span 이 같은 모양으로 쓴다.
 * start·end 는 코드 포인트 위치(없으면 null)이고, 맞지 않으면 text 를 질문에서 다시 찾는다.
 */
export type QuotedSpan = Pick<InterpretationMapping, "text" | "start" | "end">;

/**
 * 질문을 해석 과정 표현 단위로 자른다. 각 조각은 그 표현을 해석한 mapping의 번호를 갖는다.
 *
 * 서버 위치가 질문 글자와 맞으면 그 위치를, 어긋나면(질문이 바뀌었거나 서버 계산 오류)
 * 같은 글자를 질문에서 다시 찾는다. 그래도 없으면 밑줄 없이 둔다 — 목록에는 남는다.
 * 겹치는 표현은 앞에 온 것만 칠한다.
 */
export function questionSegments(
  question: string,
  mappings: ReadonlyArray<QuotedSpan>,
): QuestionSegment[] {
  const spans: Array<{ start: number; end: number; index: number }> = [];
  mappings.forEach((m, index) => {
    if (m.text === null || m.text === "") return;
    let start: number | null = null;
    if (m.start !== null && m.end !== null) {
      const s = toUtf16(question, m.start);
      const e = toUtf16(question, m.end);
      if (question.slice(s, e) === m.text) start = s;
    }
    if (start === null) {
      const at = question.indexOf(m.text);
      if (at >= 0) start = at;
    }
    if (start === null) return;
    const end = start + m.text.length;
    if (spans.some((t) => start! < t.end && end > t.start)) return;
    spans.push({ start, end, index });
  });
  spans.sort((a, b) => a.start - b.start);

  const out: QuestionSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor)
      out.push({ text: question.slice(cursor, span.start) });
    out.push({
      text: question.slice(span.start, span.end),
      mapping: span.index,
    });
    cursor = span.end;
  }
  if (cursor < question.length) out.push({ text: question.slice(cursor) });
  return out;
}

// ---------------------------------------------------------------------------
// 탐색 그래프(r8 interpretation.graph)

export const ENTITY_LABEL: Record<EntityType, string> = {
  Constituent: "구성종목",
  BusinessGroup: "기업집단",
  Issuer: "발행사",
  Manager: "운용사",
  Industry: "산업",
  Ksic: "산업분류",
  Index: "지수",
};

/** 집합 노드의 숫자 자리 문구. 상태가 숫자보다 앞선다(장애면 건수를 믿을 수 없다). */
export const GRAPH_STATE_LABEL: Record<GraphState, string> = {
  ok: "",
  empty: "0건",
  absent: "수집 안 함",
  blocked: "장애",
  ambiguous: "선택 필요",
  unread: "못 읽음",
};

export function setCountText(node: GraphNode): string {
  if (node.state === "blocked" || node.state === "ambiguous")
    return GRAPH_STATE_LABEL[node.state];
  if (node.count !== null) return `${formatCount(node.count)}건`;
  return node.state ? GRAPH_STATE_LABEL[node.state] : "";
}

function nodeText(node: GraphNode): string {
  switch (node.kind) {
    case "set": {
      const count = setCountText(node);
      return count ? `${node.label}(${count})` : node.label;
    }
    case "product":
      return node.cited ? `${node.label}(답변 인용)` : node.label;
    case "entity":
      return node.entity_type
        ? `${ENTITY_LABEL[node.entity_type]} ${node.label}`
        : node.label;
    default:
      return node.label;
  }
}

/**
 * 그래프를 문장 목록으로. 화면 읽기 프로그램과 그림을 못 보는 사람을 위한 대체 설명이며,
 * 간선 하나가 한 줄이다.
 */
export function describeGraph(graph: SearchGraph): string[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return graph.edges.flatMap((e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) return [];
    const state =
      e.state && e.state !== "ok" ? ` · ${GRAPH_STATE_LABEL[e.state]}` : "";
    if (e.kind === "subclass")
      return [`${nodeText(from)}: ${nodeText(to)}의 하위 클래스${state}`];
    const via = e.label ? ` —${e.label}→ ` : " → ";
    const weight = e.weight ? ` (비중 ${e.weight})` : "";
    return [`${nodeText(from)}${via}${nodeText(to)}${weight}${state}`];
  });
}

export interface Narrowing {
  domain: string;
  label: string;
  from: number | null;
  /** 가장 깊은 집합의 건수 문구(예: "7건", "장애", "수집 안 함"). */
  to: string;
  tone: "ok" | "empty" | "warn" | "danger";
}

/**
 * 상품군별로 "전체 몇 건 → 최종 몇 건". 시작은 상품군의 첫 집합, 끝은 가장 깊은 층의
 * 집합이다(같은 층이면 뒤에 온 것). 그래프 머리에 한 줄로 보인다.
 */
export function graphNarrowing(
  graph: SearchGraph,
  domains: InterpretedDomain[],
): Narrowing[] {
  const layers = graphLayers(graph);
  const out: Narrowing[] = [];
  for (const d of domains) {
    const sets = graph.nodes.filter(
      (n) => n.kind === "set" && n.domain === d.domain,
    );
    if (sets.length === 0) continue;
    let last = sets[0];
    for (const n of sets)
      if ((layers.get(n.id) ?? 0) >= (layers.get(last.id) ?? 0)) last = n;
    const tone =
      last.state === "blocked"
        ? "danger"
        : last.state === "empty" || last.count === 0
          ? "empty"
          : last.state === "absent" || last.state === "ambiguous"
            ? "warn"
            : "ok";
    out.push({
      domain: d.domain,
      label: d.label,
      from: sets[0] === last ? null : sets[0].count,
      to: setCountText(last),
      tone,
    });
  }
  return out;
}
