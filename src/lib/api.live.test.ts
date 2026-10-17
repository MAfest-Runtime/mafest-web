// @vitest-environment node
//
// 이 파일만 node에서 돈다. 여기서 보려는 것은 DOM이 아니라 HTTP다.
import { beforeAll, describe, expect, test } from "vitest";
import { httpApi } from "./api";
import { ApiError, type SearchResponse } from "./types";

/*
 * 실제 mafest-api를 상대로 도는 유일한 테스트(테스트 3층 중 세 번째).
 *   - 화면 테스트(App.test.tsx) : 합성 mock API. 화면 로직만 본다.
 *   - api.test.ts               : 실제 api.ts + 가짜 fetch. 요청 형태와 실패 처리를 본다.
 *   - 이 파일                   : 실제 서버. 계약이 실제로 지켜지는지 본다.
 *
 * 실행(P7 이후, 로컬 또는 port-forward한 mafest-api):
 *   MAFEST_LIVE_API=http://127.0.0.1:18080 npx vitest run src/lib/api.live.test.ts
 *
 * 읽기만 한다. 예시 최대 6회 + 상세용 검색 1회라 요청 제한(분당 6)에 걸릴 수 있다 — 공개 URL이
 * 아니라 내부 주소(port-forward)로 돌린다.
 *
 * skip과 실패를 구분한다.
 *   - MAFEST_LIVE_API가 **아예 없으면** suite 전체를 skip한다(실연동 미검증, [미실행] 표시).
 *   - 값이 있으면 실연동을 하겠다는 뜻이므로, 주소가 잘못됐거나 실행 중 전제(예시·상품 행)가
 *     깨지면 skip·return으로 빠지지 않고 assertion으로 실패한다.
 */

const baseUrl = process.env.MAFEST_LIVE_API;
const live = baseUrl !== undefined;

if (!live) {
  process.stderr.write(
    "\n[미실행] 실제 mafest-api 연동 검사를 건너뜁니다. 실연동은 검증되지 않았습니다.\n" +
      "         MAFEST_LIVE_API=<주소>를 주고 다시 실행하세요.\n\n",
  );
}

describe.skipIf(!live)("실제 mafest-api 계약", () => {
  beforeAll(() => {
    // 빈 문자열·잘못된 주소를 skip으로 넘기면 "실연동 통과"로 오해된다. 여기서 실패시킨다.
    expect(baseUrl, "MAFEST_LIVE_API가 http(s) 주소가 아니다").toMatch(
      /^https?:\/\/[^/]+/,
    );
    // api.ts는 상대 경로로 요청한다. 실제 서버 주소를 붙이려고 fetch를 한 겹 감싼다.
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      original(
        typeof input === "string" && input.startsWith("/")
          ? `${baseUrl}${input}`
          : input,
        init,
      )) as typeof fetch;
  });

  test("meta가 계약을 지키고 예시 칩이 1~6개다", async () => {
    const meta = await httpApi.getMeta();
    expect(meta.examples.length).toBeGreaterThan(0);
    expect(meta.examples.length).toBeLessThanOrEqual(6);
    expect(meta.domains.length).toBeGreaterThan(0);
  });

  test("예시 칩 질문이 모두 기대 outcome을 낸다(37 W6)", async () => {
    const meta = await httpApi.getMeta();
    // 예시가 0개면 아래 반복문이 한 번도 돌지 않고 통과한다. 개수를 먼저 확인한다.
    expect(meta.examples.length, "meta.examples가 비어 있다").toBeGreaterThan(
      0,
    );
    expect(meta.examples.length).toBeLessThanOrEqual(6);
    for (const example of meta.examples) {
      const result = (await httpApi.search(example.question)) as SearchResponse;
      expect
        .soft(result.outcome, `${example.id} ${example.question}`)
        .toBe(example.expected_outcome);
    }
  }, 120_000);

  test("answered 예시 결과의 첫 상품 상세를 열 수 있다", async () => {
    // 조건이 안 맞는다고 return으로 빠지면 상세 API를 한 번도 안 불러도 통과한다.
    // 전제가 깨지면 그 자체를 실패로 본다.
    const meta = await httpApi.getMeta();
    const answeredExamples = meta.examples.filter(
      (e) => e.expected_outcome === "answered",
    );
    expect(
      answeredExamples.length,
      "meta.examples에 answered 예시가 없다",
    ).toBeGreaterThan(0);

    // 개수 같은 집계 답은 answered여도 results가 []다(39 §2-12). 행이 있는 첫 예시를 쓴다.
    let found: { domain: string; productId: string } | null = null;
    for (const example of answeredExamples) {
      const result = (await httpApi.search(example.question)) as SearchResponse;
      expect(result.outcome, `${example.id} ${example.question}`).toBe(
        "answered",
      );
      const group = result.results.find((g) => g.rows.length > 0);
      if (group) {
        found = { domain: group.domain, productId: group.rows[0].product_id };
        break;
      }
    }
    expect(
      found,
      "answered 예시 중 상품 행을 낸 것이 하나도 없다",
    ).not.toBeNull();

    const detail = await httpApi.getProduct(found!.domain, found!.productId);
    expect(detail.product_id).toBe(found!.productId);
    expect(detail.domain).toBe(found!.domain);
    expect(detail.groups.length).toBeGreaterThan(0);
  }, 120_000);

  test("없는 상품은 404 product_not_found ErrorBody", async () => {
    // code가 http_404면 서버가 ErrorBody 계약(code·message·request_id)을 어긴 것이다.
    await expect(
      httpApi.getProduct("kr_etf", "__no_such_product__"),
    ).rejects.toMatchObject({
      status: 404,
      code: "product_not_found",
    } satisfies Partial<ApiError>);
  });
});
