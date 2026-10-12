import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";
import {
  ALL_SEARCH_FIXTURES,
  ambiguous,
  answered,
  caveatOutage,
  CONCEPT_TOPICS,
  count,
  explainFixtureFor,
  meta,
  noResult,
  PRODUCT_FIXTURES,
  STREAM_FIXTURES,
  type StreamFixtureEvent,
} from "./lib/fixtures";
import type { ExplainResponse, SearchResponse } from "./lib/types";
import {
  validateErrorBody,
  validateExplainResponse,
  validateMeta,
  validateProductDetail,
  validateSearchResponse,
  validateStream,
} from "./lib/validate";

/**
 * 명세(contract/public-api-v1.openapi.yaml) ↔ 웹 픽스처 대조.
 *
 * validate.test.ts는 웹의 손 검사기(validate.ts)로, 이 파일은 명세의 JSON Schema로 같은
 * 픽스처를 검사한다. 둘 다 통과해야 "웹이 기대하는 것 = 서버에 요구한 것"이 성립한다.
 * 서버(P7)는 같은 yaml로 실제 응답을 검사한다(39 §8).
 */
// vitest는 저장소 루트에서 실행한다(package.json의 test 스크립트).
const root = process.cwd();
const CONTRACT_PATH = resolve(root, "contract/public-api-v1.openapi.yaml");
const spec = parse(readFileSync(CONTRACT_PATH, "utf8"));

/**
 * 1.4.0 정본의 sha256. mafest `tests/contract/` 사본은 이 파일과 바이트 단위로 같아야 하고 같은 값을 고정한다.
 * 계약을 바꾸면 두 곳을 함께 바꾼다.
 */
const CONTRACT_SHA256 =
  "40f57f508e80d85565da20f5c357d69319caf7a22ff29e8d397934d16d858150";

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ ...spec, $id: "spec" });
const schema = (name: string) => {
  const validate = ajv.getSchema(`spec#/components/schemas/${name}`);
  if (!validate) throw new Error(`스키마 없음: ${name}`);
  return validate;
};

function check(name: string, value: unknown): string[] {
  const validate = schema(name);
  return validate(value)
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

describe("명세 스키마", () => {
  test.each(ALL_SEARCH_FIXTURES.map((f) => [f.request_id, f] as const))(
    "검색 응답 %s",
    (_, fixture) => {
      expect(check("SearchResponse", fixture)).toEqual([]);
    },
  );

  test("상품 상세 전부", () => {
    for (const detail of PRODUCT_FIXTURES)
      expect(check("ProductDetail", detail)).toEqual([]);
  });

  test("메타", () => {
    expect(check("Meta", meta)).toEqual([]);
  });

  test("ambiguous가 아닌데 clarify를 주면 거절한다", () => {
    const broken = {
      ...answered,
      clarify: {
        kind: "missing_condition",
        reason: "x",
        options: [
          { label: "a", question: "a" },
          { label: "b", question: "b" },
        ],
      },
    };
    expect(check("SearchResponse", broken)).not.toEqual([]);
  });

  test("표를 내지 않는 outcome에 results가 있으면 거절한다", () => {
    expect(
      check("SearchResponse", { ...answered, outcome: "refused" }),
    ).not.toEqual([]);
  });

  test("결과는 묶음당 20행을 넘지 않는다", () => {
    const row = answered.results[0].rows[0];
    const group = {
      ...answered.results[0],
      rows: Array.from({ length: 21 }, (_, i) => ({
        ...row,
        product_id: `X${i}`,
      })),
    };
    expect(
      check("SearchResponse", { ...answered, results: [group] }),
    ).not.toEqual([]);
  });

  test("상품 행이 없는 집계 답은 answered + results [] + compute 단계다(39 §2-12)", () => {
    expect(count.outcome).toBe("answered");
    expect(count.results).toEqual([]);
    expect(count.trace?.steps.some((s) => s.stage === "compute")).toBe(true);
    expect(check("SearchResponse", count)).toEqual([]);
  });

  test("부분 장애: 정상 결과 + 장애 도메인은 caveat로 결과를 유지한다(39 §2-4)", () => {
    expect(caveatOutage.outcome).toBe("caveat");
    expect(caveatOutage.results.length).toBeGreaterThan(0);
    expect(caveatOutage.answer.notices.map((n) => n.code)).toContain(
      "STORE_BLOCKED",
    );
    expect(check("SearchResponse", caveatOutage)).toEqual([]);
  });

  test("요청: 정리 전 1000자 초과 거절", () => {
    // 정리 뒤 1~200자 검사는 서버가 한다(명세 §2-1). yaml 은 원래 질문 길이만 막는다.
    expect(check("SearchRequest", { question: "가".repeat(1001) })).not.toEqual(
      [],
    );
    expect(check("SearchRequest", { question: "가".repeat(1000) })).toEqual([]);
    expect(check("SearchRequest", { question: "국내 ETF" })).toEqual([]);
  });
});

/**
 * 같은 깨진 응답을 명세 스키마와 웹 검사기(validate.ts)가 **둘 다** 거절하는지 본다.
 * 한쪽만 거절하면 "명세는 금지하는데 웹은 받아 준다"(또는 반대)가 되어 계약이 둘로 갈린다.
 * 필드 누락과 모르는 키 추가 모두 둘 다 거절한다(additionalProperties: false).
 */
type Mutation = [string, SearchResponse, (r: Record<string, unknown>) => void];

type Cells = { rows: { values: Record<string, Record<string, unknown>> }[] }[];

const MUTATIONS: Mutation[] = [
  [
    "answer.text 600자 초과",
    answered,
    (r) => {
      (r.answer as Record<string, unknown>).text = "가".repeat(601);
    },
  ],
  [
    "suggestions 4개",
    answered,
    (r) => {
      r.suggestions = Array.from({ length: 4 }, (_, i) => ({
        label: `질문 ${i}`,
        question: `국내 ETF ${i}`,
      }));
    },
  ],
  [
    "해석 과정(mappings) 누락",
    answered,
    (r) => delete (r.interpretation as Record<string, unknown>).mappings,
  ],
  [
    "해석 과정 slot이 목록 밖",
    answered,
    (r) => {
      (r.interpretation as { mappings: { slot: string }[] }).mappings[0].slot =
        "guess";
    },
  ],
  [
    "탐색 그래프(graph) 누락",
    answered,
    (r) => delete (r.interpretation as Record<string, unknown>).graph,
  ],
  [
    "그래프 노드 kind가 목록 밖",
    answered,
    (r) => {
      (
        r.interpretation as { graph: { nodes: { kind: string }[] } }
      ).graph.nodes[0].kind = "guess";
    },
  ],
  [
    "그래프 노드에 모르는 키",
    answered,
    (r) => {
      (
        r.interpretation as { graph: { nodes: Record<string, unknown>[] } }
      ).graph.nodes[0].sql = "SELECT 1";
    },
  ],
  [
    "그래프 간선 state가 목록 밖",
    answered,
    (r) => {
      (
        r.interpretation as { graph: { edges: { state: string }[] } }
      ).graph.edges[0].state = "maybe";
    },
  ],
  ["request_id 누락", answered, (r) => delete r.request_id],
  [
    "answer.generated_by 누락",
    answered,
    (r) => delete (r.answer as Record<string, unknown>).generated_by,
  ],
  [
    "interpretation.sort 누락",
    answered,
    (r) => delete (r.interpretation as Record<string, unknown>).sort,
  ],
  ["suggestions 누락", answered, (r) => delete r.suggestions],
  ["trace 누락", answered, (r) => delete r.trace],
  ["clarify 누락", answered, (r) => delete r.clarify],
  ["answered에 clarify", answered, (r) => (r.clarify = ambiguous.clarify)],
  ["refused에 results", answered, (r) => (r.outcome = "refused")],
  ["no_result에 results", noResult, (r) => (r.results = answered.results)],
  [
    "ambiguous로 바꾸고 clarify null",
    answered,
    (r) => {
      r.outcome = "ambiguous";
      r.results = [];
    },
  ],
  ["ambiguous에 clarify null", ambiguous, (r) => (r.clarify = null)],
  [
    "clarify 선택지 1개",
    ambiguous,
    (r) => {
      const c = r.clarify as { options: unknown[] };
      c.options = c.options.slice(0, 1);
    },
  ],
  [
    "suggestions 4개",
    answered,
    (r) =>
      (r.suggestions = Array.from({ length: 4 }, (_, i) => ({
        label: `l${i}`,
        question: `q${i}`,
      }))),
  ],
  [
    "label 21자",
    answered,
    (r) => (r.suggestions = [{ label: "가".repeat(21), question: "q" }]),
  ],
  [
    "limit 21",
    answered,
    (r) => ((r.interpretation as { limit: number }).limit = 21),
  ],
  [
    "행 21개",
    answered,
    (r) => {
      const g = (r.results as { rows: { product_id: string }[] }[])[0];
      g.rows = Array.from({ length: 21 }, (_, i) => ({
        ...g.rows[0],
        product_id: `X${i}`,
      }));
    },
  ],
  [
    "라우터 내부 도메인 이름",
    answered,
    (r) => {
      (
        r.interpretation as { domains: { domain: string }[] }
      ).domains[0].domain = "etf_kr";
    },
  ],
  ["모르는 최상위 키", answered, (r) => (r.debug = true)],
  [
    "모르는 셀 키",
    answered,
    (r) => ((r.results as Cells)[0].rows[0].values.code.extra = 1),
  ],
  [
    "모르는 trace 단계 키",
    answered,
    (r) =>
      ((r.trace as { steps: Record<string, unknown>[] }).steps[0].params = [5]),
  ],
  ["request_id 65자", answered, (r) => (r.request_id = "a".repeat(65))],
  ["request_id 허용 밖 문자", answered, (r) => (r.request_id = "req id/1")],
  [
    "answer.text 빈 문자열",
    answered,
    (r) => ((r.answer as { text: string }).text = ""),
  ],
  [
    "조건 op 목록 밖",
    noResult,
    (r) => {
      (r.interpretation as { conditions: { op: string }[] }).conditions[0].op =
        "like";
    },
  ],
  [
    "suggestions 질문이 공백뿐",
    answered,
    (r) => (r.suggestions = [{ label: "l", question: "   " }]),
  ],
  [
    "셀 note 누락",
    answered,
    (r) => {
      const g = (
        r.results as { rows: { values: Record<string, object> }[] }[]
      )[0];
      const { note: _note, ...rest } = g.rows[0].values.code as {
        note: unknown;
      };
      void _note;
      g.rows[0].values.code = rest;
    },
  ],
];

describe("명세 ↔ 웹 검사기 일치", () => {
  test.each(MUTATIONS)("%s: 둘 다 거절", (_, base, mutate) => {
    const broken = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(broken);
    expect(check("SearchResponse", broken), "명세가 받아 줌").not.toEqual([]);
    expect(
      () => validateSearchResponse(structuredClone(broken)),
      "웹이 받아 줌",
    ).toThrow();
  });

  test("상세·메타의 모르는 키도 둘 다 거절", () => {
    const detail = { ...structuredClone(PRODUCT_FIXTURES[0]), debug: true };
    expect(check("ProductDetail", detail)).not.toEqual([]);
    expect(() => validateProductDetail(detail)).toThrow();
    const extraMeta = { ...structuredClone(meta), build: "x" };
    expect(check("Meta", extraMeta)).not.toEqual([]);
    expect(() => validateMeta(extraMeta)).toThrow();
  });
});

describe("ErrorBody: 명세 ↔ 웹 검사기 일치", () => {
  const ok = {
    code: "invalid_question",
    message: "질문은 1~200자여야 합니다.",
    request_id: "mock-invalid-0001",
  };

  test("정상 본문은 둘 다 받는다", () => {
    expect(check("ErrorBody", ok)).toEqual([]);
    expect(() => validateErrorBody(structuredClone(ok))).not.toThrow();
  });

  const BROKEN: [string, Record<string, unknown>][] = [
    ["code 누락", { message: ok.message, request_id: ok.request_id }],
    ["message 누락", { code: ok.code, request_id: ok.request_id }],
    ["request_id 누락", { code: ok.code, message: ok.message }],
    ["미등록 code", { ...ok, code: "rate_limited" }],
    ["빈 message", { ...ok, message: "" }],
    ["request_id 65자", { ...ok, request_id: "a".repeat(65) }],
    ["모르는 키", { ...ok, detail: "x" }],
  ];

  test.each(BROKEN)("%s: 둘 다 거절", (_, body) => {
    expect(check("ErrorBody", body), "명세가 받아 줌").not.toEqual([]);
    expect(
      () => validateErrorBody(structuredClone(body)),
      "웹이 받아 줌",
    ).toThrow();
  });
});

/** 스트림 이벤트 이름 → yaml 의 data 스키마(searchStream 설명의 대응표). */
const STREAM_SCHEMA: Record<string, string> = {
  start: "StreamStart",
  interpretation: "StreamInterpretation",
  results: "StreamResults",
  answer_delta: "StreamAnswerDelta",
  answer_done: "StreamAnswerDone",
  suggestions: "StreamSuggestions",
  done: "StreamDone",
  error: "ErrorBody",
};

function withoutLast(events: StreamFixtureEvent[]): StreamFixtureEvent[] {
  return events.slice(0, -1);
}

describe("stream contract", () => {
  test.each(Object.entries(STREAM_FIXTURES))(
    "stream fixture %s passes the spec event schemas and the web stream validator",
    (_, events) => {
      for (const { event, data } of events) {
        expect(check(STREAM_SCHEMA[event], data), event).toEqual([]);
      }
      expect(() => validateStream(events)).not.toThrow();
    },
  );

  const normal = STREAM_FIXTURES.answered;
  const brokenStreams: [string, StreamFixtureEvent[]][] = [
    ["does not start with start", normal.slice(1)],
    ["ends without done or error", withoutLast(normal)],
    ["has an event after done", [...normal, normal[normal.length - 1]]],
    [
      "sends answer_delta before results",
      [normal[0], normal[1], normal[3], normal[2], ...normal.slice(4)],
    ],
    ["skips interpretation", [normal[0], ...normal.slice(2)]],
  ];

  test.each(brokenStreams)("rejects a stream that %s", (_, events) => {
    expect(() => validateStream(events)).toThrow();
  });
});

describe("answer text limit", () => {
  const withText = (text: string, base = answered) => {
    const response = structuredClone(base) as unknown as {
      answer: { text: string };
    };
    response.answer.text = text;
    return response;
  };

  test("exactly 600 characters pass both the spec and the web validator", () => {
    const response = withText("가".repeat(600));
    expect(check("SearchResponse", response)).toEqual([]);
    expect(() =>
      validateSearchResponse(structuredClone(response)),
    ).not.toThrow();
    const answer = { ...answered.answer, text: "가".repeat(600) };
    expect(check("Answer", answer)).toEqual([]);
    expect(check("StreamAnswerDone", { answer })).toEqual([]);
  });

  test("601 characters are rejected by the spec, the validator and answer_done", () => {
    const answer = { ...answered.answer, text: "가".repeat(601) };
    expect(check("Answer", answer)).not.toEqual([]);
    expect(check("StreamAnswerDone", { answer })).not.toEqual([]);
    expect(() => validateSearchResponse(withText("가".repeat(601)))).toThrow();
    const events = structuredClone(STREAM_FIXTURES.answered);
    const index = events.findIndex((e) => e.event === "answer_done");
    (events[index].data as { answer: { text: string } }).answer.text =
      "가".repeat(601);
    expect(() => validateStream(events)).toThrow();
  });

  test("a sixth sentence event index is still rejected", () => {
    expect(check("StreamAnswerDelta", { index: 4, text: "문장" })).toEqual([]);
    expect(check("StreamAnswerDelta", { index: 5, text: "문장" })).not.toEqual(
      [],
    );
  });
});

describe("explain contract", () => {
  const topic = () => structuredClone(CONCEPT_TOPICS.aum);
  const bodies: [string, ExplainResponse][] = [
    ["empty topics", { topics: [] }],
    ["one topic", { topics: [topic()] }],
    [
      "two topics",
      { topics: [topic(), structuredClone(CONCEPT_TOPICS.expense_ratio)] },
    ],
  ];

  test.each(bodies)(
    "accepts %s in the spec and the web validator",
    (_, body) => {
      expect(check("ExplainResponse", body)).toEqual([]);
      expect(() =>
        validateExplainResponse(structuredClone(body)),
      ).not.toThrow();
    },
  );

  test("every mock explanation fixture passes both checkers", () => {
    for (const request of [
      { domains: ["kr_etf"], axes: [], sort_axis: "aum" },
      { domains: ["bond"], axes: ["credit_grade"], sort_axis: null },
      { domains: ["kr_etf"], axes: ["expense_ratio"], sort_axis: "aum" },
      { domains: ["kr_etn"], axes: [], sort_axis: null },
    ] as const) {
      const body = explainFixtureFor({
        ...request,
        domains: [...request.domains],
        axes: [...request.axes],
      });
      expect(check("ExplainResponse", body)).toEqual([]);
      expect(() => validateExplainResponse(body)).not.toThrow();
    }
  });

  const broken: [string, (b: { topics: Record<string, unknown>[] }) => void][] =
    [
      [
        "three topics",
        (b) =>
          b.topics.push(
            structuredClone(b.topics[0]),
            structuredClone(b.topics[0]),
          ),
      ],
      ["unknown top-level key", (b) => Object.assign(b, { extra: 1 })],
      ["unknown topic key", (b) => (b.topics[0].score = 1)],
      ["missing detail", (b) => delete b.topics[0].detail],
      ["id with capital letters", (b) => (b.topics[0].id = "Aum")],
      [
        "title over 30 characters",
        (b) => (b.topics[0].title = "가".repeat(31)),
      ],
      [
        "summary over 120 characters",
        (b) => (b.topics[0].summary = "가".repeat(121)),
      ],
      [
        "detail over 600 characters",
        (b) => (b.topics[0].detail = "가".repeat(601)),
      ],
      ["no sources", (b) => (b.topics[0].sources = [])],
      [
        "four sources",
        (b) =>
          (b.topics[0].sources = Array.from({ length: 4 }, (_, i) => ({
            title: `출처 ${i}`,
            url: `https://example.org/${i}`,
          }))),
      ],
      [
        "javascript url",
        (b) =>
          (b.topics[0].sources = [{ title: "x", url: "javascript:alert(1)" }]),
      ],
      [
        "url with a space",
        (b) =>
          (b.topics[0].sources = [
            { title: "x", url: "https://example.org/a b" },
          ]),
      ],
      [
        "source unknown key",
        (b) =>
          (b.topics[0].sources = [
            { title: "x", url: "https://example.org", rel: "y" },
          ]),
      ],
      [
        "reviewed_at not a date",
        (b) => (b.topics[0].reviewed_at = "2026/10/01"),
      ],
      ["reviewed_at null", (b) => (b.topics[0].reviewed_at = null)],
    ];

  test.each(broken)(
    "rejects %s in both the spec and the web validator",
    (_, mutate) => {
      const body = {
        topics: [structuredClone(CONCEPT_TOPICS.aum)],
      } as unknown as {
        topics: Record<string, unknown>[];
      };
      mutate(body);
      expect(check("ExplainResponse", body), "명세가 받아 줌").not.toEqual([]);
      expect(
        () => validateExplainResponse(structuredClone(body)),
        "웹이 받아 줌",
      ).toThrow();
    },
  );

  test("request schema needs one to six domains and rejects unknown keys", () => {
    const ok = { domains: ["kr_etf"], axes: [], sort_axis: null };
    expect(check("ExplainRequest", ok)).toEqual([]);
    expect(check("ExplainRequest", { ...ok, domains: [] })).not.toEqual([]);
    expect(check("ExplainRequest", { ...ok, domains: ["etf_kr"] })).not.toEqual(
      [],
    );
    expect(check("ExplainRequest", { ...ok, question: "x" })).not.toEqual([]);
    expect(
      check("ExplainRequest", { domains: ["kr_etf"], axes: [] }),
    ).not.toEqual([]);
  });
});

describe("contract pin", () => {
  test("canonical yaml keeps the frozen 1.4.0 sha256", () => {
    const digest = createHash("sha256")
      .update(readFileSync(CONTRACT_PATH))
      .digest("hex");
    expect(digest).toBe(CONTRACT_SHA256);
    expect(spec.info.version).toBe("1.4.0");
  });
});
