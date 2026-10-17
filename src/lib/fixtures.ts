import type {
  CellValue,
  Column,
  ConceptTopic,
  ConfirmationRequired,
  ConfirmationRequiredResponse,
  DomainKey,
  ExplainRequest,
  ExplainResponse,
  GraphEdge,
  GraphNode,
  InterpretationMapping,
  InterpretedDomain,
  Meta,
  ProductDetail,
  ResultGroup,
  ResultRow,
  SearchGraph,
  SearchResponse,
  Trace,
  ValueSource,
} from "./types";

/**
 * mock 모드와 화면 테스트가 쓰는 픽스처.
 *
 * **전부 합성 값이다.** 상품명(SAMPLE·DEMO), 코드(SMP·DMO), 회사명, 수치, 건수, 테이블 이름
 * 모두 지어낸 값이며 실제 응답을 복사하지 않았다(37 §0). 실제 서버 응답을 여기에 붙여
 * 넣지 않는다 — 웹 레포는 데이터를 담지 않는다.
 *
 * 질문 → 픽스처 연결은 mockApi.ts에 있다.
 */

export const DOMAIN_LABEL: Record<DomainKey, string> = {
  bond: "채권",
  kr_etf: "국내 ETF",
  kr_etn: "국내 ETN",
  xx_etf: "해외 ETF",
  xx_etn: "해외 ETN",
  fund: "공모펀드",
};

const ETF_DATE = "2026-08-21";
const BOND_DATE = "2026-08-14";

function domain(
  key: DomainKey,
  status: InterpretedDomain["status"],
  baseDate: string | null,
): InterpretedDomain {
  return { domain: key, label: DOMAIN_LABEL[key], status, base_date: baseDate };
}

function cell(
  display: string,
  raw: CellValue["raw"],
  src: ValueSource = "system-provided",
  note: string | null = null,
): CellValue {
  return { display, raw, src, note };
}

function signed(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits);
  return value > 0 ? `+${text}%` : value < 0 ? `-${text}%` : `${text}%`;
}

/** mafest formatting.format_risk_grade와 같은 표기. 1이 가장 위험하다. */
const RISK_LABEL = [
  "",
  "매우 높은 위험",
  "높은 위험",
  "다소 높은 위험",
  "보통 위험",
  "낮은 위험",
  "매우 낮은 위험",
];

function riskDisplay(grade: number): string {
  return `${grade}등급(${RISK_LABEL[grade]})`;
}

function trillion(won: number): string {
  if (won >= 1e12) return `${(won / 1e12).toFixed(1)}조 원`;
  return `${Math.round(won / 1e8).toLocaleString("ko-KR")}억 원`;
}

const ETF_COLUMNS: Column[] = [
  { key: "code", label: "코드", kind: "code", emphasis: false },
  { key: "expense_ratio", label: "총보수", kind: "percent", emphasis: false },
  { key: "aum", label: "순자산", kind: "money", emphasis: true },
  { key: "return_1y", label: "1년 수익률", kind: "return", emphasis: false },
  { key: "risk_grade", label: "위험등급", kind: "grade", emphasis: false },
];

interface EtfSeed {
  id: string;
  name: string;
  fee: number;
  aum: number;
  ret: number;
  risk: number;
}

const ETF_SEEDS: EtfSeed[] = [
  {
    id: "SMP001",
    name: "SAMPLE 코스피200",
    fee: 0.15,
    aum: 9.1e12,
    ret: 12.3,
    risk: 2,
  },
  {
    id: "DMO014",
    name: "DEMO 미국S&P500",
    fee: 0.07,
    aum: 6.4e12,
    ret: 18.9,
    risk: 1,
  },
  {
    id: "SMP027",
    name: "SAMPLE 반도체TOP10",
    fee: 0.45,
    aum: 3.8e12,
    ret: -4.1,
    risk: 1,
  },
  {
    id: "DMO031",
    name: "DEMO 국고채3년",
    fee: 0.05,
    aum: 2.6e12,
    ret: 3.2,
    risk: 5,
  },
  {
    id: "SMP042",
    name: "SAMPLE 고배당",
    fee: 0.19,
    aum: 1.9e12,
    ret: 9.7,
    risk: 2,
  },
  {
    id: "DMO055",
    name: "DEMO 2차전지소재",
    fee: 0.39,
    aum: 1.2e12,
    ret: -21.4,
    risk: 1,
  },
  {
    id: "SMP063",
    name: "SAMPLE 미국나스닥100",
    fee: 0.07,
    aum: 9.4e11,
    ret: 24.6,
    risk: 1,
  },
  {
    id: "DMO078",
    name: "DEMO TDF2045",
    fee: 0.18,
    aum: 7.7e11,
    ret: 11.0,
    risk: 3,
  },
  {
    id: "SMP084",
    name: "SAMPLE 단기채권액티브",
    fee: 0.12,
    aum: 5.2e11,
    ret: 3.6,
    risk: 6,
  },
  {
    id: "DMO096",
    name: "DEMO 리츠부동산",
    fee: 0.29,
    aum: 3.1e11,
    ret: 0.0,
    risk: 2,
  },
];

function etfRow(seed: EtfSeed, cited: boolean): ResultRow {
  return {
    product_id: seed.id,
    name: seed.name,
    cited,
    values: {
      code: cell(seed.id, seed.id),
      expense_ratio: cell(`${seed.fee.toFixed(2)}%`, seed.fee),
      aum: cell(trillion(seed.aum), seed.aum),
      return_1y: cell(signed(seed.ret), seed.ret, "computed"),
      risk_grade: cell(riskDisplay(seed.risk), seed.risk),
    },
  };
}

function etfGroup(seeds: EtfSeed[], total: number, cited: number): ResultGroup {
  return {
    domain: "kr_etf",
    total_count: total,
    truncated: total > seeds.length,
    columns: ETF_COLUMNS,
    rows: seeds.map((seed, i) => etfRow(seed, i < cited)),
  };
}

const ETN_COLUMNS: Column[] = [
  { key: "code", label: "코드", kind: "code", emphasis: false },
  { key: "expense_ratio", label: "총보수", kind: "percent", emphasis: false },
  { key: "aum", label: "지표가치총액", kind: "money", emphasis: true },
  { key: "risk_grade", label: "위험등급", kind: "grade", emphasis: false },
];

const BOND_COLUMNS: Column[] = [
  { key: "code", label: "코드", kind: "code", emphasis: false },
  { key: "credit_grade", label: "신용등급", kind: "grade", emphasis: false },
  { key: "coupon_rate", label: "표면금리", kind: "percent", emphasis: true },
  { key: "maturity_date", label: "만기일", kind: "date", emphasis: false },
  { key: "subordinated", label: "후순위", kind: "bool", emphasis: false },
];

const BOND_SEEDS = [
  {
    id: "SMPB101",
    name: "SAMPLE캐피탈 101-2",
    grade: "AA0",
    coupon: 4.12,
    maturity: "2028-03-15",
  },
  {
    id: "DMOB205",
    name: "DEMO카드 205",
    grade: "AA+",
    coupon: 3.98,
    maturity: "2027-11-02",
  },
  {
    id: "SMPB318",
    name: "SAMPLE에너지 318",
    grade: "AA0",
    coupon: 3.91,
    maturity: "2029-06-20",
  },
  {
    id: "DMOB422",
    name: "DEMO지주 22-1",
    grade: "AAA",
    coupon: 3.74,
    maturity: "2027-02-28",
  },
];

function trace(
  steps: Trace["steps"],
  withModel: boolean,
  tokens: Trace["tokens"] = null,
): Trace {
  return {
    elapsed_ms: steps.reduce((sum, step) => sum + step.ms, 0),
    model: withModel ? "Qwen/Qwen3-4B" : null,
    tokens,
    steps,
  };
}

type MappingSpec = [
  InterpretationMapping["slot"],
  string | null,
  string,
  InterpretationMapping["method"],
  string | null,
];

/**
 * 해석 과정 픽스처. 위치는 손으로 세지 않고 질문에서 찾아 문자(code point) 단위로 계산한다.
 * 질문에 없는 표현을 적으면 바로 실패한다(픽스처가 서버 계약을 어기지 않게).
 */
function mappings(
  question: string,
  specs: MappingSpec[],
): InterpretationMapping[] {
  return specs.map(([slot, text, result, method, note]) => {
    if (text === null)
      return { slot, text, start: null, end: null, result, method, note };
    const at = question.indexOf(text);
    if (at < 0)
      throw new Error(`픽스처 오류: "${text}"가 "${question}"에 없다`);
    const start = [...question.slice(0, at)].length;
    return {
      slot,
      text,
      start,
      end: start + [...text].length,
      result,
      method,
      note,
    };
  });
}

const RENDER = {
  stage: "render",
  label: "렌더",
  ms: 1,
  detail: null,
  query: null,
} as const;

// ---------------------------------------------------------------------------
// outcome 8종 (+ fallback, 개수, 채권)

// ---------------------------------------------------------------------------
// 탐색 그래프(r8). 온톨로지 IRI는 mafest Ontology의 접두 표기를 흉내 낸 합성 값이고,
// 건수·상품은 위 합성 seed에서 만든다.

class GraphBuilder {
  nodes: GraphNode[] = [];
  edges: GraphEdge[] = [];

  node(
    id: string,
    kind: GraphNode["kind"],
    label: string,
    extra: Partial<GraphNode> = {},
  ): string {
    this.nodes.push({
      id,
      kind,
      label,
      iri: null,
      count: null,
      domain: null,
      product_id: null,
      cited: false,
      entity_type: null,
      mapping: null,
      state: null,
      ...extra,
    });
    return id;
  }

  edge(
    from: string,
    to: string,
    kind: GraphEdge["kind"],
    extra: Partial<GraphEdge> = {},
  ): void {
    this.edges.push({
      from,
      to,
      kind,
      label: null,
      mapping: null,
      weight: null,
      state: null,
      ...extra,
    });
  }

  /** 상위 클래스 fp:Product와 그 하위 클래스 하나. */
  concept(id: string, label: string, iri: string): string {
    if (!this.nodes.some((n) => n.id === "c0"))
      this.node("c0", "concept", "금융상품", { iri: "fp:Product" });
    this.node(id, "concept", label, { iri });
    this.edge(id, "c0", "subclass");
    return id;
  }

  /** 집합 → 상품 노드(최대 5개, 인용 먼저). */
  products(
    from: string,
    domain: DomainKey,
    rows: Array<{ id: string; name: string }>,
    cited: number,
    prefix: string,
  ): void {
    rows.slice(0, 5).forEach((row, i) => {
      const id = this.node(`${prefix}${i}`, "product", row.name, {
        domain,
        product_id: row.id,
        cited: i < cited,
      });
      this.edge(from, id, "member");
    });
  }

  build(): SearchGraph {
    return { nodes: this.nodes, edges: this.edges };
  }
}

const EMPTY_GRAPH: SearchGraph = { nodes: [], edges: [] };

/** 국내 상장 좁히기: 클래스 —listedOn→ 국내시장. */
function listedDomestic(g: GraphBuilder, concept: string, mapping: number) {
  g.node("v1", "individual", "국내시장", { iri: "etf:KRX", mapping });
  g.edge(concept, "v1", "property", { label: "listedOn", mapping });
}

function answeredGraph(): SearchGraph {
  const g = new GraphBuilder();
  const etf = g.concept("c1", "ETF", "fp:ETF");
  listedDomestic(g, etf, 1);
  g.node("s0", "set", "국내 ETF 전체", {
    count: 1180,
    domain: "kr_etf",
    mapping: 1,
  });
  g.edge(etf, "s0", "scope", { mapping: 1 });
  g.node("s1", "set", "순자산 ↓ 상위 5", {
    count: 5,
    domain: "kr_etf",
    mapping: 2,
  });
  g.edge("s0", "s1", "constraint", { mapping: 0 });
  g.products("s1", "kr_etf", ETF_SEEDS, 3, "p");
  return g.build();
}

function caveatGraph(): SearchGraph {
  const g = new GraphBuilder();
  const etp = g.concept("c1", "ETF·ETN", "etf:ExchangeTradedProduct");
  listedDomestic(g, etp, 2);
  g.node("s0", "set", "국내 ETF 전체", {
    count: 1180,
    domain: "kr_etf",
    mapping: 2,
  });
  g.edge(etp, "s0", "scope", { mapping: 2 });
  g.node("s1", "set", "퇴직연금 = 가능", {
    count: 412,
    domain: "kr_etf",
    mapping: 0,
  });
  g.edge("s0", "s1", "constraint", { mapping: 0 });
  g.node("s2", "set", "총보수 < 0.2%", {
    count: 7,
    domain: "kr_etf",
    mapping: 1,
  });
  g.edge("s1", "s2", "constraint", { mapping: 1 });
  g.node("s3", "set", "순자산 ↓ 상위 10", {
    count: 7,
    domain: "kr_etf",
    mapping: 4,
  });
  g.edge("s2", "s3", "constraint", { mapping: 3 });
  g.products(
    "s3",
    "kr_etf",
    ETF_SEEDS.filter((s) => s.fee < 0.2),
    1,
    "p",
  );

  g.node("t0", "set", "국내 ETN 전체", {
    count: 312,
    domain: "kr_etn",
    mapping: 2,
  });
  g.edge(etp, "t0", "scope", { mapping: 2 });
  g.node("tx", "set", "퇴직연금 값 없음 · 제외", {
    count: 4,
    domain: "kr_etn",
    state: "absent",
  });
  g.edge("t0", "tx", "constraint", { mapping: 0, state: "absent" });
  g.node("t1", "set", "퇴직연금 = 가능", {
    count: 6,
    domain: "kr_etn",
    mapping: 0,
  });
  g.edge("t0", "t1", "constraint", { mapping: 0 });
  g.node("t2", "set", "총보수 < 0.2%", {
    count: 2,
    domain: "kr_etn",
    mapping: 1,
  });
  g.edge("t1", "t2", "constraint", { mapping: 1 });
  g.products(
    "t2",
    "kr_etn",
    [
      { id: "DMON007", name: "DEMO 레버리지 금 선물 ETN" },
      { id: "SMPN012", name: "SAMPLE 미국채10년 ETN" },
    ],
    0,
    "q",
  );
  return g.build();
}

function noResultGraph(): SearchGraph {
  const g = new GraphBuilder();
  const etf = g.concept("c1", "ETF", "fp:ETF");
  listedDomestic(g, etf, 2);
  g.node("s0", "set", "국내 ETF 전체", {
    count: 1180,
    domain: "kr_etf",
    mapping: 2,
  });
  g.edge(etf, "s0", "scope", { mapping: 2 });
  g.node("s1", "set", "총보수 < 0.01%", {
    count: 3,
    domain: "kr_etf",
    mapping: 0,
  });
  g.edge("s0", "s1", "constraint", { mapping: 0 });
  g.node("s2", "set", "1년 수익률 ≥ 50%", {
    count: 0,
    domain: "kr_etf",
    mapping: 1,
    state: "empty",
  });
  g.edge("s1", "s2", "constraint", { mapping: 1, state: "empty" });
  return g.build();
}

function notCollectedGraph(): SearchGraph {
  const g = new GraphBuilder();
  const etf = g.concept("c1", "ETF", "fp:ETF");
  listedDomestic(g, etf, 1);
  g.node("s0", "set", "국내 ETF 전체", {
    count: 1180,
    domain: "kr_etf",
    mapping: 1,
  });
  g.edge(etf, "s0", "scope", { mapping: 1 });
  g.node("s1", "set", "과거 추이", {
    domain: "kr_etf",
    mapping: 0,
    state: "absent",
  });
  g.edge("s0", "s1", "constraint", { mapping: 0, state: "absent" });
  return g.build();
}

function unavailableGraph(): SearchGraph {
  const g = new GraphBuilder();
  const etf = g.concept("c1", "ETF", "fp:ETF");
  listedDomestic(g, etf, 2);
  g.node("s0", "set", "국내 ETF 전체", {
    count: 1180,
    domain: "kr_etf",
    mapping: 2,
  });
  g.edge(etf, "s0", "scope", { mapping: 2 });
  g.node("s1", "set", "SAMPLE전자 편입", {
    domain: "kr_etf",
    mapping: 1,
    state: "blocked",
  });
  g.edge("s0", "s1", "constraint", { mapping: 1, state: "blocked" });
  g.node("e1", "entity", "SAMPLE전자", {
    entity_type: "Constituent",
    mapping: 0,
  });
  g.edge("s1", "e1", "relation", {
    label: "HOLDS",
    mapping: 0,
    state: "blocked",
  });
  return g.build();
}

function ambiguousGraph(): SearchGraph {
  const g = new GraphBuilder();
  const bond = g.concept("c1", "채권", "fp:Bond");
  g.node("s0", "set", "채권 전체", { count: 4210, domain: "bond", mapping: 1 });
  g.edge(bond, "s0", "scope", { mapping: 1 });
  g.node("s1", "set", "신용등급 = ?", {
    domain: "bond",
    mapping: 0,
    state: "ambiguous",
  });
  g.edge("s0", "s1", "constraint", { mapping: 0, state: "ambiguous" });
  ["AAA", "AA-", "A-"].forEach((grade, i) => {
    g.node(`g${i}`, "individual", `${grade}${i === 0 ? "" : " 이상"}`, {
      iri: `fp:Grade_${grade.replace("-", "minus")}`,
    });
    g.edge("s1", `g${i}`, "property", {
      label: "creditGrade",
      state: "ambiguous",
    });
  });
  return g.build();
}

function countGraph(): SearchGraph {
  const g = new GraphBuilder();
  const etp = g.concept("c1", "ETF·ETN", "etf:ExchangeTradedProduct");
  listedDomestic(g, etp, 0);
  g.node("s0", "set", "국내 ETN 전체", {
    count: 312,
    domain: "kr_etn",
    mapping: 1,
  });
  g.edge(etp, "s0", "scope", { mapping: 0 });
  return g.build();
}

function bondGraph(): SearchGraph {
  const g = new GraphBuilder();
  const bond = g.concept("c1", "채권", "fp:Bond");
  g.node("s0", "set", "채권 전체", { count: 4210, domain: "bond", mapping: 2 });
  g.edge(bond, "s0", "scope", { mapping: 2 });
  g.node("s1", "set", "신용등급 ≥ AA0", {
    count: 37,
    domain: "bond",
    mapping: 0,
  });
  g.edge("s0", "s1", "constraint", { mapping: 0 });
  g.node("s2", "set", "후순위 = 아님", {
    count: 4,
    domain: "bond",
    mapping: 1,
  });
  g.edge("s1", "s2", "constraint", { mapping: 1 });
  g.node("s3", "set", "표면금리 ↓ 상위 10", {
    count: 4,
    domain: "bond",
    mapping: 4,
  });
  g.edge("s2", "s3", "constraint", { mapping: 3 });
  g.products("s3", "bond", BOND_SEEDS, 2, "p");
  return g.build();
}

function caveatOutageGraph(): SearchGraph {
  const g = new GraphBuilder();
  const etp = g.concept("c1", "ETF·ETN", "etf:ExchangeTradedProduct");
  listedDomestic(g, etp, 1);
  g.node("s0", "set", "국내 ETF 전체", {
    count: 1180,
    domain: "kr_etf",
    mapping: 1,
  });
  g.edge(etp, "s0", "scope", { mapping: 1 });
  g.node("s1", "set", "총보수 < 0.2%", {
    count: 7,
    domain: "kr_etf",
    mapping: 0,
  });
  g.edge("s0", "s1", "constraint", { mapping: 0 });
  g.node("s2", "set", "순자산 ↓ 상위 10", {
    count: 7,
    domain: "kr_etf",
    mapping: 3,
  });
  g.edge("s1", "s2", "constraint", { mapping: 2 });
  g.products(
    "s2",
    "kr_etf",
    ETF_SEEDS.filter((s) => s.fee < 0.2),
    1,
    "p",
  );
  g.node("t0", "set", "국내 ETN", {
    domain: "kr_etn",
    mapping: 1,
    state: "blocked",
  });
  g.edge(etp, "t0", "scope", { mapping: 1, state: "blocked" });
  return g.build();
}

export const answered: SearchResponse = {
  request_id: "mock-answered-0001",
  question: "순자산 큰 국내 ETF 5개",
  outcome: "answered",
  answer: {
    text: "순자산이 가장 큰 국내 ETF는 SAMPLE 코스피200(순자산 9.1조 원, 총보수 0.15%)입니다. 그다음은 DEMO 미국S&P500(6.4조 원)과 SAMPLE 반도체TOP10(3.8조 원)입니다.",
    generated_by: "llm",
    notices: [
      {
        code: "RETURN_PAST",
        text: "수익률은 과거 성과이며 미래 수익을 보장하지 않습니다.",
      },
    ],
  },
  interpretation: {
    graph: answeredGraph(),
    mappings: mappings("순자산 큰 국내 ETF 5개", [
      ["sort", "순자산 큰", "순자산 ↓", "rule", "'큰'·'많은'은 내림차순"],
      ["domain", "국내 ETF", "국내 ETF", "synonym", "상품군 사전 일치"],
      ["limit", "5개", "상위 5", "pattern", "숫자 + '개'"],
    ]),

    domains: [domain("kr_etf", "FOUND", ETF_DATE)],
    conditions: [],
    sort: { axis: "aum", label: "순자산", dir: "desc" },
    limit: 5,
  },
  results: [etfGroup(ETF_SEEDS.slice(0, 5), 1180, 3)],
  clarify: null,
  suggestions: [
    { label: "총보수 순위로", question: "총보수 낮은 국내 ETF 5개" },
  ],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 4,
        detail: "국내 ETF · 순위 질의",
        query: null,
      },
      {
        stage: "query",
        label: "조회",
        ms: 38,
        detail: "5행",
        query:
          "SELECT code, name, expense_ratio, aum, return_1y, risk_grade\n  FROM sample_kr_etf\n ORDER BY aum DESC NULLS LAST\n LIMIT $1;",
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 2,
        detail: "통과 · 상품군 FOUND",
        query: null,
      },
      {
        stage: "generate",
        label: "생성",
        ms: 2840,
        detail: "문장 3개",
        query: null,
      },
      {
        stage: "verify",
        label: "검증",
        ms: 3,
        detail: "인용 수치 4개 일치",
        query: null,
      },
      RENDER,
    ],
    true,
    { prompt: 1212, completion: 96 },
  ),
};

export const caveat: SearchResponse = {
  request_id: "mock-caveat-0002",
  question: "퇴직연금 가능하고 총보수 0.2% 미만인 ETF·ETN 순자산 큰 순",
  outcome: "caveat",
  answer: {
    text: "조건에 맞는 국내 ETF 7개 중 순자산이 가장 큰 상품은 SAMPLE 코스피200(9.1조 원)입니다. 국내 ETN은 일부 상품의 퇴직연금 가능 여부가 없어 확인된 2개만 보여줍니다.",
    generated_by: "llm",
    notices: [
      {
        code: "PARTIAL_AXIS",
        text: "국내 ETN 4개는 퇴직연금 가능 여부가 수집되지 않아 결과에서 뺐습니다.",
      },
      {
        code: "PENSION_RULE",
        text: "퇴직연금 편입 가능 여부는 상품 정보 기준입니다. 실제 가능 여부는 계좌를 연 금융회사에 확인해야 합니다.",
      },
    ],
  },
  interpretation: {
    graph: caveatGraph(),
    mappings: mappings(
      "퇴직연금 가능하고 총보수 0.2% 미만인 ETF·ETN 순자산 큰 순",
      [
        [
          "condition",
          "퇴직연금 가능",
          "퇴직연금 = 가능",
          "synonym",
          "범주 값 사전('퇴직연금' 축)",
        ],
        [
          "condition",
          "총보수 0.2% 미만",
          "총보수 < 0.2%",
          "pattern",
          "축 이름 + 숫자·단위 + '미만'",
        ],
        [
          "domain",
          "ETF·ETN",
          "국내 ETF·국내 ETN",
          "rule",
          "상장시장 낱말이 없으면 국내 상장으로 좁힘",
        ],
        ["sort", "순자산 큰 순", "순자산 ↓", "rule", "'큰 순'은 내림차순"],
        ["limit", null, "상위 10", "default", "개수 말이 없으면 10개"],
      ],
    ),

    domains: [
      domain("kr_etf", "FOUND", ETF_DATE),
      domain("kr_etn", "PARTIAL", BOND_DATE),
    ],
    conditions: [
      {
        axis: "pension_eligible",
        label: "퇴직연금",
        op: "=",
        value: true,
        display: "퇴직연금 가능",
      },
      {
        axis: "expense_ratio",
        label: "총보수",
        op: "<",
        value: 0.2,
        display: "총보수 < 0.2%",
      },
    ],
    sort: { axis: "aum", label: "순자산", dir: "desc" },
    limit: 10,
  },
  results: [
    etfGroup(
      ETF_SEEDS.filter((s) => s.fee < 0.2),
      7,
      1,
    ),
    {
      domain: "kr_etn",
      total_count: 2,
      truncated: false,
      columns: ETN_COLUMNS,
      rows: [
        {
          product_id: "DMON007",
          name: "DEMO 레버리지 금 선물 ETN",
          cited: false,
          values: {
            code: cell("DMON007", "DMON007"),
            expense_ratio: cell("0.18%", 0.18),
            aum: cell("1,240억 원", 1.24e11),
            risk_grade: cell(riskDisplay(1), 1),
          },
        },
        {
          product_id: "SMPN012",
          name: "SAMPLE 미국채10년 ETN",
          cited: false,
          values: {
            code: cell("SMPN012", "SMPN012"),
            expense_ratio: cell("0.15%", 0.15),
            aum: cell("860억 원", 8.6e10),
            risk_grade: cell(
              riskDisplay(3),
              3,
              "system-provided",
              "발행사 제공 등급",
            ),
          },
        },
      ],
    },
  ],
  clarify: null,
  suggestions: [
    {
      label: "국내 ETF만",
      question: "퇴직연금 가능하고 총보수 0.2% 미만인 국내 ETF",
    },
  ],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 6,
        detail: "국내 ETF·국내 ETN · 복합 조건",
        query: null,
      },
      {
        stage: "query",
        label: "조회",
        ms: 61,
        detail: "국내 ETF 7행 · 국내 ETN 2행(4행 제외)",
        query:
          "SELECT code, name, expense_ratio, aum, return_1y, risk_grade\n  FROM sample_kr_etf\n WHERE pension_eligible = $1 AND expense_ratio < $2\n ORDER BY aum DESC NULLS LAST\n LIMIT $3;",
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 3,
        detail: "부분 통과 · 국내 ETN PARTIAL",
        query: null,
      },
      {
        stage: "generate",
        label: "생성",
        ms: 3310,
        detail: "문장 2개",
        query: null,
      },
      {
        stage: "verify",
        label: "검증",
        ms: 4,
        detail: "인용 수치 2개 일치",
        query: null,
      },
      RENDER,
    ],
    true,
    { prompt: 1687, completion: 121 },
  ),
};

export const noResult: SearchResponse = {
  request_id: "mock-no-result-0003",
  question: "총보수 0.01% 미만이고 1년 수익률 50% 이상인 국내 ETF",
  outcome: "no_result",
  answer: {
    text: "조건에 맞는 국내 ETF가 없습니다.",
    generated_by: "template",
    notices: [],
  },
  interpretation: {
    graph: noResultGraph(),
    mappings: mappings("총보수 0.01% 미만이고 1년 수익률 50% 이상인 국내 ETF", [
      [
        "condition",
        "총보수 0.01% 미만",
        "총보수 < 0.01%",
        "pattern",
        "축 이름 + 숫자·단위 + '미만'",
      ],
      [
        "condition",
        "1년 수익률 50% 이상",
        "1년 수익률 ≥ 50%",
        "pattern",
        "기간 + 축 이름 + 숫자 + '이상'",
      ],
      ["domain", "국내 ETF", "국내 ETF", "synonym", "상품군 사전 일치"],
      ["limit", null, "상위 10", "default", "개수 말이 없으면 10개"],
    ]),

    domains: [domain("kr_etf", "EMPTY", ETF_DATE)],
    conditions: [
      {
        axis: "expense_ratio",
        label: "총보수",
        op: "<",
        value: 0.01,
        display: "총보수 < 0.01%",
      },
      {
        axis: "return_1y",
        label: "1년 수익률",
        op: ">=",
        value: 50,
        display: "1년 수익률 ≥ 50%",
      },
    ],
    sort: null,
    limit: 10,
  },
  results: [],
  clarify: null,
  suggestions: [
    {
      label: "총보수 조건 완화",
      question: "총보수 0.1% 미만이고 1년 수익률 20% 이상인 국내 ETF",
    },
    { label: "수익률 조건 빼기", question: "총보수 낮은 국내 ETF 5개" },
  ],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 4,
        detail: "국내 ETF · 조건 검색",
        query: null,
      },
      {
        stage: "query",
        label: "조회",
        ms: 22,
        detail: "0행",
        query:
          "SELECT code, name, expense_ratio, return_1y\n  FROM sample_kr_etf\n WHERE expense_ratio < $1 AND return_1y >= $2\n LIMIT $3;",
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 1,
        detail: "EMPTY → 정형 문장",
        query: null,
      },
      RENDER,
    ],
    false,
  ),
};

export const notCollected: SearchResponse = {
  request_id: "mock-not-collected-0004",
  question: "국내 ETF 순자산 과거 추이 알려줘",
  outcome: "not_collected",
  answer: {
    text: "과거 이력과 추이는 이 서비스가 수집하지 않은 데이터라 답할 수 없습니다.",
    generated_by: "template",
    notices: [
      {
        code: "AXIS_ABSENT",
        text: "없는 항목: 과거 추이(과거 이력·추이를 수집하지 않음). 상품 정보 스냅샷만 다룹니다.",
      },
    ],
  },
  interpretation: {
    graph: notCollectedGraph(),
    mappings: mappings("국내 ETF 순자산 과거 추이 알려줘", [
      [
        "time",
        "과거 추이",
        "과거 이력·추이",
        "rule",
        "과거 낱말 → 시계열 요구(수집하지 않음)",
      ],
      ["domain", "국내 ETF", "국내 ETF", "synonym", "상품군 사전 일치"],
    ]),

    domains: [domain("kr_etf", "AXIS_ABSENT", ETF_DATE)],
    conditions: [],
    sort: null,
    limit: null,
  },
  results: [],
  clarify: null,
  suggestions: [
    { label: "지금 순자산 순위로", question: "순자산 큰 국내 ETF 5개" },
  ],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 3,
        detail: "국내 ETF · 시계열(과거 추이) 요구",
        query: null,
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 1,
        detail: "AXIS_ABSENT(axis) → 정형 문장",
        query: null,
      },
      RENDER,
    ],
    false,
  ),
};

export const unavailable: SearchResponse = {
  request_id: "mock-unavailable-0005",
  question: "SAMPLE전자를 편입한 국내 ETF",
  outcome: "unavailable",
  answer: {
    text: "지금 이 데이터를 불러올 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
    generated_by: "template",
    notices: [
      {
        code: "STORE_BLOCKED",
        text: "구성종목 관계 저장소에 연결하지 못했습니다.",
      },
    ],
  },
  interpretation: {
    graph: unavailableGraph(),
    mappings: mappings("SAMPLE전자를 편입한 국내 ETF", [
      [
        "entity",
        "SAMPLE전자",
        "회사 SAMPLE전자",
        "entity",
        "회사 이름 사전 일치",
      ],
      [
        "condition",
        "편입한",
        "구성종목에 포함",
        "rule",
        "'편입·담은' → 구성종목 관계",
      ],
      ["domain", "국내 ETF", "국내 ETF", "synonym", "상품군 사전 일치"],
      ["limit", null, "상위 10", "default", "개수 말이 없으면 10개"],
    ]),

    domains: [domain("kr_etf", "AXIS_ABSENT", ETF_DATE)],
    conditions: [
      {
        axis: "holding",
        label: "구성종목",
        op: "contains",
        value: "SAMPLE전자",
        display: "SAMPLE전자 편입",
      },
    ],
    sort: null,
    limit: 10,
  },
  results: [],
  clarify: null,
  suggestions: [],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 5,
        detail: "국내 ETF · 관계 질의",
        query: null,
      },
      {
        stage: "query",
        label: "조회",
        ms: 3002,
        detail: "관계 조회 실패 · 연결 시간 초과",
        query:
          "SELECT * FROM cypher('sample_graph', $$\n  MATCH (e:ETF)-[h:HOLDS]->(c:Company {name: $name})\n  RETURN e.code, h.weight ORDER BY h.weight DESC LIMIT 10\n$$) AS (code agtype, weight agtype);",
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 1,
        detail: "AXIS_ABSENT(blocked) → 정형 문장",
        query: null,
      },
      RENDER,
    ],
    false,
  ),
};

export const ambiguous: SearchResponse = {
  request_id: "mock-ambiguous-0006",
  question: "신용등급 좋은 채권",
  outcome: "ambiguous",
  answer: {
    text: "'좋은' 신용등급의 기준을 정할 수 없어 범위를 골라야 합니다.",
    generated_by: "template",
    notices: [],
  },
  interpretation: {
    graph: ambiguousGraph(),
    mappings: mappings("신용등급 좋은 채권", [
      [
        "condition",
        "신용등급 좋은",
        "신용등급 기준 없음",
        "rule",
        "'좋은'은 등급 경계가 아니라 선택지를 물음",
      ],
      ["domain", "채권", "채권", "synonym", "상품군 사전 일치"],
    ]),

    domains: [domain("bond", "AMBIGUOUS", BOND_DATE)],
    conditions: [],
    sort: null,
    limit: 10,
  },
  results: [],
  clarify: {
    kind: "missing_condition",
    reason:
      "신용등급 기준이 없습니다. 아래에서 범위를 고르면 그 조건으로 다시 검색합니다.",
    options: [
      { label: "AAA만", question: "신용등급 AAA 채권 표면금리 높은 순" },
      {
        label: "AA- 이상",
        question: "신용등급 AA- 이상 채권 표면금리 높은 순",
      },
      { label: "A- 이상", question: "신용등급 A- 이상 채권 표면금리 높은 순" },
    ],
  },
  suggestions: [],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 4,
        detail: "채권 · 조건 값 없음(신용등급)",
        query: null,
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 1,
        detail: "AMBIGUOUS(missing_condition)",
        query: null,
      },
      RENDER,
    ],
    false,
  ),
};

export const refused: SearchResponse = {
  request_id: "mock-refused-0007",
  question: "앞으로 오를 ETF 추천해줘",
  outcome: "refused",
  answer: {
    text: "이 서비스는 상품 추천이나 가격 전망을 하지 않습니다. 상품 정보에 기록된 값으로 찾고 비교하는 질문에 답합니다.",
    generated_by: "template",
    notices: [
      {
        code: "POLICY_RECOMMEND",
        text: "추천·전망·투자성향 적합성 판단은 답하지 않습니다.",
      },
    ],
  },
  interpretation: {
    graph: EMPTY_GRAPH,
    mappings: mappings("앞으로 오를 ETF 추천해줘", [
      ["policy", "앞으로 오를", "가격 전망", "rule", "미래 가격을 묻는 표현"],
      [
        "domain",
        "ETF",
        "ETF",
        "synonym",
        "상품군 사전 일치(조회 전 정책으로 멈춤)",
      ],
      ["policy", "추천해줘", "상품 추천", "rule", "추천 요청은 답하지 않음"],
    ]),
    domains: [],
    conditions: [],
    sort: null,
    limit: null,
  },
  results: [],
  clarify: null,
  suggestions: [
    { label: "과거 수익률로 찾기", question: "1년 수익률 높은 국내 ETF 5개" },
    { label: "비용으로 찾기", question: "총보수 낮은 국내 ETF 5개" },
  ],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 2,
        detail: "정책 판정 · 추천·전망",
        query: null,
      },
      RENDER,
    ],
    false,
  ),
};

function unreadGraph(): SearchGraph {
  const g = new GraphBuilder();
  const etf = g.concept("c1", "ETF", "fp:ETF");
  listedDomestic(g, etf, 2);
  g.node("s0", "set", "국내 ETF 전체", {
    count: 1180,
    domain: "kr_etf",
    mapping: 2,
  });
  g.edge(etf, "s0", "scope", { mapping: 2 });
  // 읽은 조건(총보수 정렬)은 그리지 않고, 못 읽은 구절에서 unread 집합 하나로 끝낸다(명세 §2-6-2).
  g.node("s1", "set", "'공부 중인데' 못 읽음", {
    domain: "kr_etf",
    mapping: 0,
    state: "unread",
  });
  g.edge("s0", "s1", "constraint", { mapping: 0, state: "unread" });
  return g.build();
}

/** [r9] 질문 일부를 조건으로 읽지 못해 조회하지 않은 경우. 다시 물을 질문은 못 읽은 구절을 뺀 질문이다. */
export const unread: SearchResponse = {
  request_id: "mock-unread-0011",
  question: "공부 중인데 총보수 낮은 국내 ETF",
  outcome: "unread",
  answer: {
    text: "질문의 '공부 중인데' 부분을 조건으로 정확히 읽지 못해 조회하지 않았습니다. 항목과 기준을 함께 적어 주세요(예: 총보수 0.3% 이하).",
    generated_by: "template",
    notices: [],
  },
  interpretation: {
    graph: unreadGraph(),
    mappings: mappings("공부 중인데 총보수 낮은 국내 ETF", [
      [
        "condition",
        "공부 중인데",
        "조건 해석 불가(조회하지 않음)",
        "rule",
        "어떤 조건으로도 읽히지 않은 낱말",
      ],
      ["sort", "총보수 낮은", "총보수 ↑", "rule", "'낮은'은 오름차순"],
      ["domain", "국내 ETF", "국내 ETF", "synonym", "상품군 사전 일치"],
    ]),
    domains: [domain("kr_etf", "AXIS_ABSENT", ETF_DATE)],
    conditions: [],
    sort: { axis: "expense_ratio", label: "총보수", dir: "asc" },
    limit: 10,
  },
  results: [],
  clarify: null,
  suggestions: [
    { label: "'공부 중인데' 빼고", question: "총보수 낮은 국내 ETF" },
  ],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 3,
        detail: "국내 ETF · 해석되지 않은 낱말 '공부 중인데'",
        query: null,
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 1,
        detail: "CONDITION_NOT_PARSED → 정형 문장",
        query: null,
      },
      RENDER,
    ],
    false,
  ),
};

/** [r9] 새 notice 코드(시세 하루치 값·이상치 제외)를 쓰는 답. */
export const priceSnapshot: SearchResponse = {
  ...answered,
  request_id: "mock-price-snapshot-0012",
  question: "괴리율 1% 이하 국내 ETF 순자산 큰 순",
  answer: {
    text: "괴리율 1% 이하 국내 ETF 중 순자산이 가장 큰 상품은 SAMPLE 코스피200(9.1조 원)입니다.",
    generated_by: "llm",
    notices: [
      {
        code: "PRICE_SNAPSHOT",
        text: "괴리율·거래량은 시세 기준일 하루치 값입니다.",
      },
      {
        code: "OUTLIER_EXCLUDED",
        text: "괴리율 절댓값 5%를 넘는 값은 이상치로 보고 뺐습니다.",
      },
    ],
  },
  interpretation: {
    ...answered.interpretation,
    mappings: mappings("괴리율 1% 이하 국내 ETF 순자산 큰 순", [
      ["sort", "순자산 큰", "순자산 ↓", "rule", "'큰'·'많은'은 내림차순"],
      ["domain", "국내 ETF", "국내 ETF", "synonym", "상품군 사전 일치"],
      [
        "condition",
        "괴리율 1% 이하",
        "괴리율 ≤ 1%",
        "pattern",
        "축 이름 + 숫자·단위 + 비교어",
      ],
    ]),
  },
};

export const errorOutcome: SearchResponse = {
  request_id: "mock-error-0008",
  question: "오류 재현",
  outcome: "error",
  answer: {
    text: "답변을 만드는 중 오류가 났습니다.",
    generated_by: "template",
    notices: [],
  },
  interpretation: {
    graph: EMPTY_GRAPH,
    mappings: mappings("오류 재현", []),
    domains: [],
    conditions: [],
    sort: null,
    limit: null,
  },
  results: [],
  clarify: null,
  suggestions: [],
  trace: null,
};

/** 생성 모델이 꺼진 상태. outcome은 answered지만 문장 대신 표만 준다. */
export const fallback: SearchResponse = {
  ...answered,
  request_id: "mock-fallback-0009",
  question: "순자산 큰 국내 ETF 5개 (모델 꺼짐)",
  answer: {
    text: "조회 결과 5개를 순자산 순으로 보여줍니다.",
    generated_by: "fallback",
    notices: answered.answer.notices,
  },
  results: [etfGroup(ETF_SEEDS.slice(0, 5), 1180, 0)],
  trace: trace(
    [
      ...answered.trace!.steps.filter(
        (s) => s.stage === "route" || s.stage === "query" || s.stage === "gate",
      ),
      {
        stage: "generate",
        label: "생성",
        ms: 30000,
        detail: "모델 응답 없음 · 표만 반환",
        query: null,
      },
      RENDER,
    ],
    true,
  ),
};

export const count: SearchResponse = {
  request_id: "mock-count-0010",
  question: "국내 상장 ETN은 몇 개야?",
  outcome: "answered",
  answer: {
    text: "국내 ETN은 모두 312개입니다.",
    generated_by: "template",
    notices: [],
  },
  interpretation: {
    graph: countGraph(),
    mappings: mappings("국내 상장 ETN은 몇 개야?", [
      ["domain", "국내 상장 ETN", "국내 ETN", "rule", "'국내 상장' → 국내 ETN"],
      ["aggregate", "몇 개", "개수 세기", "pattern", "'몇 개' → 개수 집계"],
    ]),

    domains: [domain("kr_etn", "FOUND", BOND_DATE)],
    conditions: [],
    sort: null,
    limit: null,
  },
  results: [],
  clarify: null,
  suggestions: [],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 3,
        detail: "국내 ETN · 개수",
        query: null,
      },
      {
        stage: "query",
        label: "조회",
        ms: 9,
        detail: "1행",
        query: "SELECT count(*) FROM sample_kr_etn;",
      },
      {
        stage: "compute",
        label: "연산",
        ms: 0,
        detail: "개수 312",
        query: null,
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 1,
        detail: "개수 질의 → 정형 문장",
        query: null,
      },
      RENDER,
    ],
    false,
  ),
};

export const bond: SearchResponse = {
  request_id: "mock-bond-0011",
  question: "신용등급 AA0 이상, 후순위 아닌 채권 표면금리 높은 순",
  outcome: "answered",
  answer: {
    text: "표면금리가 가장 높은 채권은 SAMPLE캐피탈 101-2(AA0, 4.12%)이고, DEMO카드 205(AA+, 3.98%)가 뒤를 잇습니다.",
    generated_by: "llm",
    notices: [],
  },
  interpretation: {
    graph: bondGraph(),
    mappings: mappings("신용등급 AA0 이상, 후순위 아닌 채권 표면금리 높은 순", [
      [
        "condition",
        "신용등급 AA0 이상",
        "신용등급 ≥ AA0",
        "pattern",
        "등급 모양(AA0) + '이상'",
      ],
      [
        "condition",
        "후순위 아닌",
        "후순위 = 아님",
        "rule",
        "범주 값 + 부정('아닌')",
      ],
      ["domain", "채권", "채권", "synonym", "상품군 사전 일치"],
      [
        "sort",
        "표면금리 높은 순",
        "표면금리 ↓",
        "rule",
        "'높은 순'은 내림차순",
      ],
      ["limit", null, "상위 10", "default", "개수 말이 없으면 10개"],
    ]),

    domains: [domain("bond", "FOUND", BOND_DATE)],
    conditions: [
      {
        axis: "credit_grade",
        label: "신용등급",
        op: ">=",
        value: "AA0",
        display: "신용등급 ≥ AA0",
      },
      {
        axis: "subordinated",
        label: "후순위",
        op: "=",
        value: false,
        display: "후순위 아님",
      },
    ],
    sort: { axis: "coupon_rate", label: "표면금리", dir: "desc" },
    limit: 10,
  },
  results: [
    {
      domain: "bond",
      total_count: 4,
      truncated: false,
      columns: BOND_COLUMNS,
      rows: BOND_SEEDS.map((seed, i) => ({
        product_id: seed.id,
        name: seed.name,
        cited: i < 2,
        values: {
          code: cell(seed.id, seed.id),
          credit_grade: cell(seed.grade, seed.grade),
          coupon_rate: cell(`${seed.coupon.toFixed(2)}%`, seed.coupon),
          maturity_date: cell(seed.maturity, seed.maturity),
          subordinated: cell("아님", false),
        },
      })),
    },
  ],
  clarify: null,
  suggestions: [],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 5,
        detail: "채권 · 복합 조건",
        query: null,
      },
      {
        stage: "query",
        label: "조회",
        ms: 44,
        detail: "4행",
        query:
          "SELECT code, name, credit_grade, coupon_rate, maturity_date, subordinated\n  FROM sample_bond\n WHERE grade_rank(credit_grade) <= grade_rank($1) AND subordinated = $2\n ORDER BY coupon_rate DESC\n LIMIT $3;",
      },
      { stage: "gate", label: "게이트", ms: 2, detail: "통과", query: null },
      {
        stage: "generate",
        label: "생성",
        ms: 2410,
        detail: "문장 1개",
        query: null,
      },
      {
        stage: "verify",
        label: "검증",
        ms: 2,
        detail: "인용 수치 4개 일치",
        query: null,
      },
      RENDER,
    ],
    true,
    { prompt: 1104, completion: 64 },
  ),
};

/**
 * 다중 도메인 부분 장애(39 §2-4): 국내 ETF는 FOUND, 국내 ETN은 DB 연결 오류로 장애 도메인.
 * 정상 결과를 버리지 않고 caveat로 싣고, 장애 도메인은 STORE_BLOCKED notice로 남긴다.
 */
export const caveatOutage: SearchResponse = {
  request_id: "mock-caveat-outage-0012",
  question: "총보수 0.2% 미만 ETF·ETN 순자산 큰 순",
  outcome: "caveat",
  answer: {
    text: "조건에 맞는 국내 ETF 중 순자산이 가장 큰 상품은 SAMPLE 코스피200(9.1조 원)입니다. 국내 ETN은 지금 불러올 수 없어 결과에 넣지 못했습니다.",
    generated_by: "llm",
    notices: [
      {
        code: "STORE_BLOCKED",
        text: "국내 ETN 데이터를 지금 불러올 수 없습니다.",
      },
    ],
  },
  interpretation: {
    graph: caveatOutageGraph(),
    mappings: mappings("총보수 0.2% 미만 ETF·ETN 순자산 큰 순", [
      [
        "condition",
        "총보수 0.2% 미만",
        "총보수 < 0.2%",
        "pattern",
        "축 이름 + 숫자·단위 + '미만'",
      ],
      [
        "domain",
        "ETF·ETN",
        "국내 ETF·국내 ETN",
        "rule",
        "상장시장 낱말이 없으면 국내 상장으로 좁힘",
      ],
      ["sort", "순자산 큰 순", "순자산 ↓", "rule", "'큰 순'은 내림차순"],
      ["limit", null, "상위 10", "default", "개수 말이 없으면 10개"],
    ]),

    domains: [
      domain("kr_etf", "FOUND", ETF_DATE),
      domain("kr_etn", "AXIS_ABSENT", BOND_DATE),
    ],
    conditions: [
      {
        axis: "expense_ratio",
        label: "총보수",
        op: "<",
        value: 0.2,
        display: "총보수 < 0.2%",
      },
    ],
    sort: { axis: "aum", label: "순자산", dir: "desc" },
    limit: 10,
  },
  results: [
    etfGroup(
      ETF_SEEDS.filter((s) => s.fee < 0.2),
      7,
      1,
    ),
  ],
  clarify: null,
  suggestions: [],
  trace: trace(
    [
      {
        stage: "route",
        label: "라우팅",
        ms: 5,
        detail: "국내 ETF·국내 ETN · 조건 검색",
        query: null,
      },
      {
        stage: "query",
        label: "조회",
        ms: 5004,
        detail: "국내 ETF 7행 · 국내 ETN 연결 실패",
        query: null,
      },
      {
        stage: "gate",
        label: "게이트",
        ms: 2,
        detail: "부분 통과 · 국내 ETN 장애",
        query: null,
      },
      {
        stage: "generate",
        label: "생성",
        ms: 2950,
        detail: "문장 2개",
        query: null,
      },
      RENDER,
    ],
    true,
    { prompt: 1320, completion: 88 },
  ),
};

/** outcome 9종 대표 픽스처. 계약·화면 테스트가 이 목록을 돈다. */
export const OUTCOME_FIXTURES = {
  answered,
  caveat,
  no_result: noResult,
  not_collected: notCollected,
  unread,
  unavailable,
  ambiguous,
  refused,
  error: errorOutcome,
} as const;

export const ALL_SEARCH_FIXTURES: SearchResponse[] = [
  ...Object.values(OUTCOME_FIXTURES),
  fallback,
  count,
  bond,
  caveatOutage,
  priceSnapshot,
];

// ---------------------------------------------------------------------------
// [r9] 스트림(POST /v1/search/stream)
// ---------------------------------------------------------------------------

/** 스트림 이벤트 한 줄(event 이름 + data). 계약 테스트가 data 를 yaml 이벤트 스키마로 검사한다. */
export interface StreamFixtureEvent {
  event: string;
  data: unknown;
}

/** results 이벤트 때의 그래프. 상품 노드의 cited 는 LLM 문장 검증 전이라 모두 false 다. */
function uncited(graph: SearchGraph): SearchGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.kind === "product" ? { ...node, cited: false } : node,
    ),
  };
}

/** results 이벤트 때의 표. 답이 아직 없으니 어떤 행도 인용되지 않았다(cited 는 done 에서 확정된다). */
function uncitedGroups(groups: ResultGroup[]): ResultGroup[] {
  return groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({ ...row, cited: false })),
  }));
}

/** start → interpretation → results 까지. 해석 때 graph 는 빈 그래프다. */
function streamHead(response: SearchResponse): StreamFixtureEvent[] {
  return [
    {
      event: "start",
      data: { request_id: response.request_id, question: response.question },
    },
    {
      event: "interpretation",
      data: {
        interpretation: {
          ...response.interpretation,
          graph: { nodes: [], edges: [] },
        },
      },
    },
    {
      event: "results",
      data: {
        outcome: response.outcome,
        results: uncitedGroups(response.results),
        clarify: response.clarify,
        graph: uncited(response.interpretation.graph),
      },
    },
  ];
}

/** 정상 스트림: 문장 두 개를 보낸 뒤 answer_done·suggestions·done. */
const ANSWER_SENTENCES = [
  "순자산이 가장 큰 국내 ETF는 SAMPLE 코스피200(순자산 9.1조 원, 총보수 0.15%)입니다.",
  "그다음은 DEMO 미국S&P500(6.4조 원)과 SAMPLE 반도체TOP10(3.8조 원)입니다.",
];

/**
 * 기준 확인 대기의 합성 값. 세션 id·secret 은 지어낸 토큰이다(실제 값이 아니다). 계약 테스트가 이것을
 * ConfirmationRequired 스키마로 검사하고, 화면·클라이언트 테스트가 확인 대기 응답으로 쓴다.
 */
export const confirmationRequired: ConfirmationRequired = {
  original_question: "안전한 국내 ETF 5개 보여줘",
  understood_conditions: ["국내 ETF", "5개"],
  pending_criterion: { id: "safety", label: "안전" },
  prompt: "안전하다는 기준은 어떤 뜻인가요?",
  actions: ["answer_text"],
  answer_max_length: 200,
  session: {
    id: "sample-session-0123456789abcdef",
    secret: "sample-secret-fedcba9876543210",
    version: 1,
    expires_at: "2030-01-01T00:10:00Z",
  },
};

/** `/v1/search` JSON 의 확인 대기 응답. */
export const confirmationResponse: ConfirmationRequiredResponse = {
  kind: "confirmation_required",
  confirmation: confirmationRequired,
};

export const STREAM_FIXTURES: Record<string, StreamFixtureEvent[]> = {
  // 기준 확인: start → confirmation_required 로 done 없이 정상 종료한다.
  confirmation: [
    {
      event: "start",
      data: {
        request_id: "sample-confirm-start",
        question: confirmationRequired.original_question,
      },
    },
    { event: "confirmation_required", data: confirmationRequired },
  ],
  answered: [
    ...streamHead(answered),
    ...ANSWER_SENTENCES.map((text, index) => ({
      event: "answer_delta",
      data: { index, text },
    })),
    { event: "answer_done", data: { answer: answered.answer } },
    { event: "suggestions", data: { suggestions: answered.suggestions } },
    { event: "done", data: { response: answered } },
  ],
  // 생성 시한(20초) 초과: 문장 없이 fallback 답으로 끝낸다. 표는 그대로다.
  generationTimeout: [
    ...streamHead(fallback),
    { event: "answer_done", data: { answer: fallback.answer } },
    { event: "suggestions", data: { suggestions: fallback.suggestions } },
    { event: "done", data: { response: fallback } },
  ],
  // 전체 시한(30초) 초과: 그 자리에서 error 한 번 보내고 닫는다.
  requestTimeout: [
    ...streamHead(answered).slice(0, 3),
    {
      event: "error",
      data: {
        code: "timeout",
        message: "요청 시간이 초과됐습니다.",
        request_id: answered.request_id,
      },
    },
  ],
};

/**
 * 응답 픽스처 하나를 스트림 이벤트 묶음으로 바꾼다. mock 스트림이 쓰고, 검사기를 통과해야 한다.
 * 답을 LLM이 만든 응답(generated_by=llm)만 문장을 하나씩(최대 5개) 나눠 보낸다. 템플릿·fallback 답은 문장 없이
 * answer_done 으로 바로 간다(계약 §2-13).
 */
export function streamEventsFor(
  response: SearchResponse,
): StreamFixtureEvent[] {
  const sentences =
    response.answer.generated_by === "llm"
      ? response.answer.text.split(/(?<=[.!?])\s+/).slice(0, 5)
      : [];
  return [
    ...streamHead(response),
    ...sentences.map((text, index) => ({
      event: "answer_delta",
      data: { index, text },
    })),
    { event: "answer_done", data: { answer: response.answer } },
    { event: "suggestions", data: { suggestions: response.suggestions } },
    { event: "done", data: { response } },
  ];
}

// ---------------------------------------------------------------------------
// 상품 상세

/** 검색 결과 행에서 상세를 만든다. 상세 화면 동작을 보이기 위한 합성 데이터다. */
function detailFromRow(group: ResultGroup, row: ResultRow): ProductDetail {
  const asOf =
    group.domain === "bond" || group.domain === "kr_etn" ? BOND_DATE : ETF_DATE;
  const field = (key: string) => {
    const column = group.columns.find((c) => c.key === key)!;
    const value = row.values[key];
    return {
      key,
      label: column.label,
      kind: column.kind,
      display: value.display,
      raw: value.raw,
      src: value.src,
      note: value.note,
      as_of: asOf,
    };
  };
  const has = (key: string) => key in row.values;
  const manager = row.name.startsWith("SAMPLE")
    ? "SAMPLE자산운용"
    : "DEMO자산운용";

  const groups: ProductDetail["groups"] = [
    {
      key: "basic",
      label: "기본정보",
      fields: [
        {
          key: "name",
          label: "상품명",
          kind: "text",
          display: row.name,
          raw: row.name,
          src: "system-provided",
          note: null,
          as_of: asOf,
        },
        field("code"),
        {
          key: "manager",
          label: group.domain === "bond" ? "발행사" : "운용사",
          kind: "text",
          display: group.domain === "bond" ? row.name.split(" ")[0] : manager,
          raw: manager,
          src: "system-provided",
          note: null,
          as_of: asOf,
        },
        {
          key: "listed_date",
          label: group.domain === "bond" ? "발행일" : "상장일",
          kind: "date",
          display: "2021-04-12",
          raw: "2021-04-12",
          src: "system-provided",
          note: null,
          as_of: asOf,
        },
      ],
    },
  ];
  if (has("expense_ratio"))
    groups.push({
      key: "cost",
      label: "비용",
      fields: [
        field("expense_ratio"),
        {
          key: "ter",
          label: "총비용비율(TER)",
          kind: "percent",
          display: "—",
          raw: null,
          src: "unavailable",
          note: "이 상품군은 원천 자료에 TER 항목이 없습니다.",
          as_of: null,
        },
      ],
    });
  if (has("return_1y"))
    groups.push({
      key: "return",
      label: "수익률",
      fields: [
        field("return_1y"),
        {
          key: "return_3m",
          label: "3개월 수익률",
          kind: "return",
          display: "+2.4%",
          raw: 2.4,
          src: "computed",
          note: "기준가 시계열에서 계산한 값입니다.",
          as_of: asOf,
        },
      ],
    });
  if (has("coupon_rate"))
    groups.push({
      key: "rate",
      label: "금리·만기",
      fields: [
        field("coupon_rate"),
        field("maturity_date"),
        field("subordinated"),
      ],
    });
  const riskFields = ["risk_grade", "credit_grade"].filter(has).map(field);
  if (riskFields.length > 0)
    groups.push({ key: "risk", label: "위험", fields: riskFields });
  if (has("aum"))
    groups.push({ key: "size", label: "규모", fields: [field("aum")] });

  const relations: ProductDetail["relations"] =
    group.domain === "kr_etf"
      ? [
          {
            type: "holding",
            label: "상위 구성종목",
            items: [
              {
                id: "C-SMP-01",
                name: "SAMPLE전자",
                display: "24.1%",
                question: "SAMPLE전자를 편입한 국내 ETF",
              },
              {
                id: "C-DMO-02",
                name: "DEMO하이텍",
                display: "9.8%",
                question: "DEMO하이텍을 편입한 국내 ETF",
              },
              {
                id: "C-SMP-03",
                name: "SAMPLE바이오",
                display: "3.2%",
                question: "SAMPLE바이오를 편입한 국내 ETF",
              },
            ],
          },
          {
            type: "manager",
            label: "운용사",
            items: [
              {
                id: null,
                name: manager,
                display: null,
                question: `${manager}가 운용하는 국내 ETF 순자산 큰 순`,
              },
            ],
          },
          {
            type: "index",
            label: "기초지수",
            items: [
              {
                id: null,
                name: `${row.name.split(" ")[1] ?? "SAMPLE"} 지수`,
                display: null,
                question: null,
              },
            ],
          },
        ]
      : [];

  return {
    domain: group.domain,
    domain_label: DOMAIN_LABEL[group.domain],
    product_id: row.product_id,
    name: row.name,
    groups,
    relations,
  };
}

export const PRODUCT_FIXTURES: ProductDetail[] = (() => {
  const seen = new Map<string, ProductDetail>();
  for (const response of ALL_SEARCH_FIXTURES)
    for (const group of response.results)
      for (const row of group.rows) {
        const key = `${group.domain}/${row.product_id}`;
        if (!seen.has(key)) seen.set(key, detailFromRow(group, row));
      }
  return [...seen.values()];
})();

// ---------------------------------------------------------------------------
// 메타

// ---------------------------------------------------------------------------
// 개념 설명(POST /v1/explain). 일반 개념 설명이며 지어낸 합성 문장이다. 출처 주소도 예시 도메인이다.

export const CONCEPT_TOPICS: Record<string, ConceptTopic> = {
  expense_ratio: {
    id: "expense_ratio",
    title: "총보수",
    summary:
      "펀드·ETF를 맡아 운용하는 대가로 해마다 순자산에서 빠지는 비용입니다.",
    detail:
      "총보수는 운용·판매·수탁 보수를 합친 연간 비용 비율입니다. 순자산에서 매일 조금씩 차감되어 기준가격에 반영되므로 따로 청구서가 오지 않습니다. 비슷한 상품이라면 총보수가 낮을수록 장기 보유 시 비용 부담이 작습니다.",
    sources: [
      {
        title: "내부 조회 자료 · 총보수 항목 설명",
        url: "https://example.org/mafest-data/blob/v2026.10.1/concepts/expense_ratio.md",
      },
    ],
    reviewed_at: "2026-10-01",
  },
  aum: {
    id: "aum",
    title: "순자산",
    summary: "상품이 투자자에게서 모아 굴리고 있는 자산의 총액입니다.",
    detail:
      "순자산은 상품이 보유한 자산에서 부채를 뺀 금액입니다. 순자산이 크면 거래가 활발한 경향이 있지만 수익이 좋다는 뜻은 아닙니다. 기준일마다 값이 달라지므로 조회 결과의 기준일을 함께 확인합니다.",
    sources: [
      {
        title: "내부 조회 자료 · 순자산 항목 설명",
        url: "https://example.org/mafest-data/blob/v2026.10.1/concepts/aum.md",
      },
      {
        title: "내부 조회 자료 · 기준일 안내",
        url: "https://example.org/mafest-data/blob/v2026.10.1/concepts/base_date.md",
      },
    ],
    reviewed_at: "2026-10-01",
  },
  return_1y: {
    id: "return_1y",
    title: "수익률",
    summary:
      "정해진 기간 동안 가격이 얼마나 변했는지를 비율로 나타낸 과거 성과입니다.",
    detail:
      "수익률은 과거 기간의 변화율이며 미래 수익을 보장하지 않습니다. 기간(1개월·1년 등)과 기준일이 다르면 서로 비교할 수 없습니다. 분배금 재투자 여부에 따라 계산이 달라질 수 있습니다.",
    sources: [
      {
        title: "내부 조회 자료 · 수익률 항목 설명",
        url: "https://example.org/mafest-data/blob/v2026.10.1/concepts/return.md",
      },
    ],
    reviewed_at: "2026-10-01",
  },
  credit_grade: {
    id: "credit_grade",
    title: "신용등급",
    summary:
      "채권을 발행한 곳이 원금과 이자를 갚을 능력을 등급으로 나타낸 것입니다.",
    detail:
      "신용등급은 평가회사가 발행자의 상환 능력을 문자로 표시한 것입니다. 등급이 낮을수록 이자는 높을 수 있지만 상환하지 못할 위험도 커집니다. 평가회사마다 등급이 다를 수 있습니다.",
    sources: [
      {
        title: "내부 조회 자료 · 신용등급 항목 설명",
        url: "https://example.org/mafest-data/blob/v2026.10.1/concepts/credit_grade.md",
      },
    ],
    reviewed_at: "2026-10-01",
  },
};

/** 정렬 축 → 조건 축 → 상품군 순으로 설명 주제를 고른다(최대 2개). 근거가 없으면 빈 목록이다. */
export function explainFixtureFor(body: ExplainRequest): ExplainResponse {
  const wanted = [
    ...(body.sort_axis ? [body.sort_axis] : []),
    ...body.axes,
    ...(body.domains.includes("bond") ? ["credit_grade"] : []),
  ];
  const topics: ConceptTopic[] = [];
  for (const axis of wanted) {
    const topic = CONCEPT_TOPICS[axis];
    if (topic && !topics.some((t) => t.id === topic.id)) topics.push(topic);
  }
  return { topics: structuredClone(topics.slice(0, 2)) };
}

export const meta: Meta = {
  domains: [
    { domain: "kr_etf", label: "국내 ETF", count: 1180, base_date: ETF_DATE },
    { domain: "xx_etf", label: "해외 ETF", count: 5400, base_date: ETF_DATE },
    { domain: "kr_etn", label: "국내 ETN", count: 312, base_date: BOND_DATE },
    { domain: "xx_etn", label: "해외 ETN", count: 260, base_date: ETF_DATE },
    { domain: "bond", label: "채권", count: 4210, base_date: BOND_DATE },
    { domain: "fund", label: "공모펀드", count: 9850, base_date: BOND_DATE },
  ],
  // 실제 칩은 P7 sweep에서 기대 outcome이 확인된 gold id만 서버가 내려준다(37 §2-2).
  examples: [
    {
      id: "MOCK-1",
      category: "순위",
      question: answered.question,
      expected_outcome: "answered",
    },
    {
      id: "MOCK-2",
      category: "복합 조건",
      question: caveat.question,
      expected_outcome: "caveat",
    },
    {
      id: "MOCK-3",
      category: "개수",
      question: count.question,
      expected_outcome: "answered",
    },
    {
      id: "MOCK-4",
      category: "채권",
      question: bond.question,
      expected_outcome: "answered",
    },
    {
      id: "MOCK-5",
      category: "수집 범위 밖",
      question: notCollected.question,
      expected_outcome: "not_collected",
    },
    {
      id: "MOCK-6",
      category: "거절",
      question: refused.question,
      expected_outcome: "refused",
    },
  ],
  llm_available: true,
};
