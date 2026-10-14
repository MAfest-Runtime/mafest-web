/**
 * 공개 API 계약. 정본은 `contract/public-api-v1.openapi.yaml`, 값 채우는 규칙은
 * 작업 공간 `docs/repos/mafest/plans/39_공개API_명세.md`다.
 *
 * yaml이 바뀌면 이 파일, validate.ts, 픽스처를 함께 고친다. contract.test.ts가 픽스처를
 * yaml로, 같은 깨진 응답을 yaml과 validate.ts 둘 다로 검사하므로 어긋나면 실패한다.
 *
 * 도메인 키는 Evidence 계약 키다. 라우터 내부 이름(etf_kr 등)은 API에 나오지 않는다.
 */

export const DOMAIN_KEYS = [
  "bond",
  "kr_etf",
  "kr_etn",
  "xx_etf",
  "xx_etn",
  "fund",
] as const;
export type DomainKey = (typeof DOMAIN_KEYS)[number];

export const OUTCOMES = [
  "answered",
  "caveat",
  "no_result",
  "not_collected",
  "unread",
  "unavailable",
  "ambiguous",
  "refused",
  "error",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const EVIDENCE_STATUSES = [
  "FOUND",
  "PARTIAL",
  "EMPTY",
  "AXIS_ABSENT",
  "AMBIGUOUS",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** `GenerationOutcome.generation_mode` 매핑: LLM_GENERATED→llm, DETERMINISTIC_TEMPLATE→template, LLM_ERROR→fallback. */
export const GENERATED_BY = ["llm", "template", "fallback"] as const;
export type GeneratedBy = (typeof GENERATED_BY)[number];

export const CLARIFY_KINDS = [
  "missing_condition",
  "domain_context",
  "product_context",
  "listing_market",
] as const;
export type ClarifyKind = (typeof CLARIFY_KINDS)[number];

export const TRACE_STAGES = [
  "route",
  "llm_parse",
  "query",
  "compute",
  "gate",
  "verify",
  "generate",
  "suggest",
  "render",
] as const;
export type TraceStage = (typeof TRACE_STAGES)[number];

/** 열 종류. 숫자형(money·percent·return·count)은 오른쪽 정렬·고정폭으로 그린다. */
export const COLUMN_KINDS = [
  "text",
  "code",
  "money",
  "percent",
  "return",
  "count",
  "grade",
  "date",
  "bool",
] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

/** 값 출처. mafest Evidence의 `src` 값을 그대로 쓴다. */
export const VALUE_SOURCES = [
  "system-provided",
  "external",
  "computed",
  "unavailable",
] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

export const CONDITION_OPS = [
  "=",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "contains",
  "in",
  "between",
] as const;

export const RELATION_TYPES = [
  "holding",
  "manager",
  "issuer_group",
  "index",
] as const;

/** 앱이 만드는 오류 본문의 code. yaml `ErrorBody.code` enum과 같다. */
export const ERROR_CODES = [
  "invalid_question",
  "timeout",
  "unknown_domain",
  "product_not_found",
  "unavailable",
  "internal",
  "session_expired",
  "session_conflict",
  "turn_in_progress",
  "turn_indeterminate",
  "confirm_unsupported",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * 앱이 만드는 4xx·5xx 본문(검색 500 제외). Traefik 요청 제한 429는 이 형식이 아닐 수 있다.
 */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
  request_id: string;
}

export interface Notice {
  code: string;
  text: string;
}

/**
 * 39 §2-5 notice 코드 표에 있는 코드. yaml 의 `Notice.code` 는 자유 문자열이라 검사기는 모르는 코드를
 * 막지 않는다. 화면이 코드별로 다르게 그릴 때 이 목록을 쓴다.
 */
export const NOTICE_CODES = [
  "RETURN_PAST",
  "PARTIAL_AXIS",
  "PENSION_RULE",
  "AXIS_ABSENT",
  "STORE_BLOCKED",
  "POLICY_RECOMMEND",
  "PRICE_SNAPSHOT",
  "ZERO_EXCLUDED",
  "OUTLIER_EXCLUDED",
  "JUDGED_ONLY",
  "NULL_EXCLUDED",
  "CONDITION_NOT_PARSED",
] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];

export interface Answer {
  text: string;
  generated_by: GeneratedBy;
  notices: Notice[];
}

export interface InterpretedDomain {
  domain: DomainKey;
  label: string;
  status: EvidenceStatus;
  /** 상품군별 기준일. 단일 as_of는 없다(데이터 원칙). */
  base_date: string | null;
}

export interface Condition {
  axis: string;
  label: string;
  op: string;
  value: string | number | boolean | null;
  display: string;
}

export interface Sort {
  axis: string;
  label: string;
  dir: "asc" | "desc";
}

export const MAPPING_SLOTS = [
  "domain",
  "condition",
  "sort",
  "limit",
  "aggregate",
  "entity",
  "time",
  "policy",
] as const;
export type MappingSlot = (typeof MAPPING_SLOTS)[number];

export const MAPPING_METHODS = [
  "synonym",
  "pattern",
  "rule",
  "entity",
  "default",
  "llm",
] as const;
export type MappingMethod = (typeof MAPPING_METHODS)[number];

/**
 * [r6] 해석 과정 한 줄: "질문의 이 부분 → 이렇게 읽음 → 이 장치로".
 * start·end는 정규화한 question의 문자(code point) 위치 [start, end). 질문에 없는
 * 해석(기본값·추론)은 text·start·end가 null.
 */
export interface InterpretationMapping {
  slot: MappingSlot;
  text: string | null;
  start: number | null;
  end: number | null;
  result: string;
  method: MappingMethod;
  note: string | null;
}

export const GRAPH_NODE_KINDS = [
  "concept",
  "individual",
  "set",
  "product",
  "entity",
] as const;
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

export const GRAPH_EDGE_KINDS = [
  "subclass",
  "property",
  "scope",
  "constraint",
  "member",
  "relation",
] as const;
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

export const GRAPH_STATES = [
  "ok",
  "empty",
  "absent",
  "blocked",
  "ambiguous",
  "unread",
] as const;
export type GraphState = (typeof GRAPH_STATES)[number];

/** 관계 개체 종류. mafest 그래프 노드 label과 같은 이름(graph_runner.py 스키마). */
export const ENTITY_TYPES = [
  "Constituent",
  "BusinessGroup",
  "Issuer",
  "Manager",
  "Industry",
  "Ksic",
  "Index",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** [r8] 탐색 그래프 노드. 모든 필드가 항상 온다(해당 없으면 null·false). */
export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  iri: string | null;
  count: number | null;
  domain: DomainKey | null;
  product_id: string | null;
  cited: boolean;
  entity_type: EntityType | null;
  mapping: number | null;
  state: GraphState | null;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  label: string | null;
  mapping: number | null;
  weight: string | null;
  state: GraphState | null;
}

/**
 * [r8] 탐색 그래프: 질문에 쓴 온톨로지 개념 → 조건마다 줄어드는 상품 집합 → 결과 상품 →
 * 지식그래프 관계. 못 만들면 nodes·edges가 모두 비어 있다.
 */
export interface SearchGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Interpretation {
  /** [r8] 탐색 그래프. */
  graph: SearchGraph;
  /** [r6] 해석 과정. 서버가 아직 기록하지 못하면 []. */
  mappings: InterpretationMapping[];
  domains: InterpretedDomain[];
  conditions: Condition[];
  sort: Sort | null;
  limit: number | null;
}

export interface Column {
  key: string;
  label: string;
  kind: ColumnKind;
  emphasis: boolean;
}

export interface CellValue {
  display: string;
  raw: string | number | boolean | null;
  src: ValueSource;
  note: string | null;
}

export interface ResultRow {
  product_id: string;
  name: string;
  /** 답변 문장이 이 상품을 인용했는가. */
  cited: boolean;
  values: Record<string, CellValue>;
}

export interface ResultGroup {
  domain: DomainKey;
  total_count: number;
  truncated: boolean;
  columns: Column[];
  rows: ResultRow[];
}

export interface QuestionOption {
  label: string;
  question: string;
}

export interface Clarify {
  kind: ClarifyKind;
  reason: string;
  options: QuestionOption[];
}

export interface TraceStep {
  stage: TraceStage;
  label: string;
  ms: number;
  detail: string | null;
  query: string | null;
}

export interface Trace {
  elapsed_ms: number;
  model: string | null;
  tokens: { prompt: number; completion: number } | null;
  steps: TraceStep[];
}

export interface SearchResponse {
  request_id: string;
  question: string;
  outcome: Outcome;
  answer: Answer;
  interpretation: Interpretation;
  results: ResultGroup[];
  clarify: Clarify | null;
  /**
   * 이어서 할 수 있는 질문. 최대 3개. answered·caveat(후속 질문), no_result(완화 질문),
   * refused(대신 할 수 있는 질문), not_collected·unread(다시 물을 질문)에서 쓴다. 없으면 서버가
   * `[]`을 보낸다. 키 누락은 계약 위반이다.
   */
  suggestions: QuestionOption[];
  trace: Trace | null;
}

export interface ProductField {
  key: string;
  label: string;
  kind: ColumnKind;
  display: string;
  raw: string | number | boolean | null;
  src: ValueSource;
  note: string | null;
  as_of: string | null;
}

export interface FieldGroup {
  key: string;
  label: string;
  fields: ProductField[];
}

export interface RelationItem {
  id: string | null;
  name: string;
  /** 비중 등 보조 표시값. */
  display: string | null;
  /** 누르면 이어지는 검색 질문. 없으면 이름으로 검색한다. */
  question: string | null;
}

export interface Relation {
  type: string;
  label: string;
  items: RelationItem[];
}

export interface ProductDetail {
  domain: DomainKey;
  domain_label: string;
  product_id: string;
  name: string;
  groups: FieldGroup[];
  relations: Relation[];
}

export interface MetaDomain {
  domain: DomainKey;
  label: string;
  count: number;
  base_date: string | null;
}

export interface MetaExample {
  /** gold 문항 id (예: E03). */
  id: string;
  /** 칩 위 작은 분류 이름 (순위·복합 조건·개수…). */
  category: string;
  question: string;
  expected_outcome: Outcome;
}

export interface Meta {
  domains: MetaDomain[];
  examples: MetaExample[];
  llm_available: boolean;
}

/** 설명 주제의 출처(yaml ConceptSource). `url`은 http(s)만 온다. */
export interface ConceptSource {
  title: string;
  url: string;
}

/** 검토된 설명 자료 한 주제(yaml ConceptTopic). 일반 개념 설명이며 특정 상품의 조회 근거가 아니다. */
export interface ConceptTopic {
  id: string;
  title: string;
  /** 짧은 설명. */
  summary: string;
  /** 상세 설명. 응답에 이미 들어 있어 펼쳐도 요청을 보내지 않는다. */
  detail: string;
  sources: ConceptSource[];
  /** 자료를 검토한 날(YYYY-MM-DD). */
  reviewed_at: string;
}

/** `POST /v1/explain` 요청(yaml ExplainRequest). 질문 원문은 담지 않는다. */
export interface ExplainRequest {
  domains: DomainKey[];
  axes: string[];
  sort_axis: string | null;
}

export interface ExplainResponse {
  topics: ConceptTopic[];
}

/** 설명 주제 상한. */
export const CONCEPT_TOPICS_MAX = 2;
export const CONCEPT_SOURCES_MAX = 3;
export const EXPLAIN_DOMAINS_MAX = 6;
export const EXPLAIN_AXES_MAX = 12;

/** 확인 답변 동작. 첫 버전은 답변 입력 하나뿐이다(기본 기준으로 계속하는 동작은 없다). */
export const CONFIRM_ACTIONS = ["answer_text"] as const;
export type ConfirmAction = (typeof CONFIRM_ACTIONS)[number];

/** 확인 답변 글자 수 상한(코드 포인트). yaml ConfirmRequest.answer.maxLength 와 같다. */
export const CONFIRM_ANSWER_MAX = 200;

export interface ConfirmSession {
  id: string;
  /** 제출 때 헤더로 되돌려 보내는 값. 메모리(상태)에만 두고 URL·콘솔·저장소에 쓰지 않는다. */
  secret: string;
  version: number;
  expires_at: string;
}

/** 기준 확인 대기(yaml ConfirmationRequired). 화면은 서버가 준 문구만 보여 준다. */
export interface ConfirmationRequired {
  original_question: string;
  understood_conditions: string[];
  pending_criterion: { id: string; label: string };
  prompt: string;
  actions: ConfirmAction[];
  answer_max_length: number;
  session: ConfirmSession;
}

/** `/v1/search` JSON 의 확인 대기 응답. SearchResponse 와는 `kind` 로 구분한다. */
export interface ConfirmationRequiredResponse {
  kind: "confirmation_required";
  confirmation: ConfirmationRequired;
}

/** 최초 검색(JSON)의 결과: 완성 응답 또는 확인 대기. */
export type SearchResult = SearchResponse | ConfirmationRequiredResponse;

export function isConfirmationRequired(
  result: SearchResult,
): result is ConfirmationRequiredResponse {
  return "kind" in result;
}

/** `POST /v1/search/confirm` 요청. 본문은 session_id·version·action·answer, 헤더는 두 값뿐이다. */
export interface ConfirmRequest {
  /** 사용자의 제출 한 번에 하나. 전송 결과를 모를 때 같은 값으로 다시 보낸다. */
  idempotencyKey: string;
  sessionId: string;
  /** X-Session-Secret 헤더로만 보낸다. */
  secret: string;
  version: number;
  action: ConfirmAction;
  answer: string;
}

export interface SearchApi {
  /**
   * `POST /v1/search`. `runKey`는 최초 검색 실행 하나를 가리키는 Idempotency-Key 다. 같은 실행의 스트림 재시도·
   * JSON 대체는 같은 값을, 새 질문·새 실행은 새 값을 쓴다. 기준 확인이 필요하면 ConfirmationRequiredResponse 를 준다.
   */
  search(
    question: string,
    signal?: AbortSignal,
    runKey?: string,
  ): Promise<SearchResult>;
  /**
   * `POST /v1/search/confirm`. 답은 원 질문에 붙이지 않고 세션으로 보낸다. 오류는 ApiError 로 던진다
   * (409 turn_in_progress 는 retryAfter 를 담는다). 응답의 question 이 원 질문인지는 호출한 쪽이 본다.
   */
  confirm(
    request: ConfirmRequest,
    signal?: AbortSignal,
  ): Promise<SearchResponse>;
  getProduct(
    domain: string,
    productId: string,
    signal?: AbortSignal,
  ): Promise<ProductDetail>;
  getMeta(signal?: AbortSignal): Promise<Meta>;
  /**
   * `POST /v1/explain`. 검색과 별도로 부르는 개념 설명이다. 주제는 0~2개이고 비어 있으면 정상이다.
   * 실패해도 검색 결과는 그대로 둔다(호출한 쪽이 설명 영역만 비운다).
   */
  explain(body: ExplainRequest, signal?: AbortSignal): Promise<ExplainResponse>;
  /**
   * `POST /v1/search/stream`. 검사를 마친 이벤트를 도착 순서대로 낸다. 마지막은 `done`이거나, 기준 확인이
   * 필요하면 `confirmation_required`다(이것도 정상 종료이며 끊김이 아니다).
   * - 스트림을 열기 전 오류(422·429·504 등)와 `error` 이벤트는 ApiError로 던진다.
   * - 스트림을 쓸 수 없으면(비 SSE 응답·열기 전 연결 실패·5xx) StreamUnavailableError를 던진다.
   * - 연결이 done·error 없이 끊기면 StreamCutError를 던진다.
   * - 계약과 어긋난 이벤트·순서는 ApiError(200, "invalid_response")다. 그 이벤트는 내지 않는다.
   */
  searchStream(
    question: string,
    signal?: AbortSignal,
    runKey?: string,
  ): AsyncIterable<StreamEvent>;
}

/** 스트림을 열 수 없어 `POST /v1/search`로 대신해야 하는 경우. 이벤트가 하나도 나오기 전이다. */
export class StreamUnavailableError extends Error {
  constructor() {
    super("stream_unavailable");
    this.name = "StreamUnavailableError";
  }
}

/** 이벤트를 받던 연결이 done·error 없이 끊김. 자동 재시도 1회의 대상이다. */
export class StreamCutError extends Error {
  constructor() {
    super("stream_cut");
    this.name = "StreamCutError";
  }
}

/**
 * HTTP 실패. 429는 Traefik 요청 제한이므로 retryAfter(초)와 "rate_limited"를 쓴다.
 * 그 밖에는 앱 ErrorBody의 code를 그대로 쓰고, ErrorBody로 읽을 수 없는 실패는
 * "http_<status>"다. 성공 응답 본문이 계약과 다르면
 * code="invalid_response", 연결 자체가 안 되면 status=0·code="network".
 */
/**
 * 열린 SSE 의 `turn_in_progress` error 이벤트에는 Retry-After 헤더가 없다. 계약이 정한 고정 대기(초)이며,
 * 일반 HTTP 409 도 헤더가 빠졌을 때 같은 값을 쓴다.
 */
export const IN_PROGRESS_RETRY_SECONDS = 2;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter: number | null = null,
    readonly requestId: string | null = null,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

/** 409 중 이 화면이 아는 code 인가. 모르는 409 는 일반 오류로 둔다(처리 중으로 추측하지 않는다). */
export function isSearchConflict(error: ApiError): boolean {
  return (
    error.status === 409 &&
    (error.code === "turn_in_progress" ||
      error.code === "session_conflict" ||
      error.code === "turn_indeterminate")
  );
}

/** 정리(공백·전각 반각화) 뒤 질문 길이 상한. 입력창도 이 길이까지 받는다. */
export const QUESTION_MAX = 200;
/** 정리하기 전 원래 질문 길이 상한(SearchRequest.question maxLength). */
export const QUESTION_RAW_MAX = 1000;
/** answer.text 상한(최대 5문장·600자). */
export const ANSWER_TEXT_MAX = 600;
/** suggestions 상한. */
export const SUGGESTIONS_MAX = 3;

/**
 * `POST /v1/search/stream` 이벤트. 순서: start → interpretation → results → answer_delta(0개 이상)
 * → answer_done → suggestions → done. 실패하면 그 자리에서 error 한 번 보내고 닫는다.
 * done 의 response 는 `/v1/search` 응답과 같은 스키마이고, 웹은 이것으로 화면을 최종 확정한다.
 * 기준 확인이 필요하면 start → (interpretation) → confirmation_required 로 done 없이 정상 종료한다.
 */
export const STREAM_EVENT_NAMES = [
  "start",
  "interpretation",
  "results",
  "answer_delta",
  "answer_done",
  "suggestions",
  "done",
  "confirmation_required",
  "error",
] as const;
export type StreamEventName = (typeof STREAM_EVENT_NAMES)[number];

export interface StreamStart {
  request_id: string;
  question: string;
}

/** 해석 직후. interpretation.graph 는 아직 빈 그래프다. */
export interface StreamInterpretation {
  interpretation: Interpretation;
}

/** 조회·게이트 뒤. 탐색 그래프를 여기서 보낸다(상품 노드 cited 는 모두 false, done 에서 확정). */
export interface StreamResults {
  outcome: Outcome;
  results: ResultGroup[];
  clarify: Clarify | null;
  graph: SearchGraph;
}

/** 검증을 통과한 답 문장 하나. index 는 0~4. */
export interface StreamAnswerDelta {
  index: number;
  text: string;
}

export interface StreamAnswerDone {
  answer: Answer;
}

export interface StreamSuggestions {
  suggestions: QuestionOption[];
}

export interface StreamDone {
  response: SearchResponse;
}

export type StreamEvent =
  | { event: "start"; data: StreamStart }
  | { event: "interpretation"; data: StreamInterpretation }
  | { event: "results"; data: StreamResults }
  | { event: "answer_delta"; data: StreamAnswerDelta }
  | { event: "answer_done"; data: StreamAnswerDone }
  | { event: "suggestions"; data: StreamSuggestions }
  | { event: "done"; data: StreamDone }
  | { event: "confirmation_required"; data: ConfirmationRequired }
  | { event: "error"; data: ErrorBody };
