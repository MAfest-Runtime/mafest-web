import {
  EXPLAIN_AXES_MAX,
  type ExplainRequest,
  type SearchResponse,
} from "./types";

/**
 * 최종 검색 응답에서 개념 설명 요청을 만든다. 설명이 필요 없는 응답이면 null이다.
 *
 * - 표가 있는 답(answered·caveat)에만 설명을 붙인다. 못 읽었거나 거절한 질문에는 설명할 상품군이 없다.
 * - 질문 원문은 보내지 않는다. 실제로 적용된 상품군·조건 축·정렬 축만 보낸다.
 */
export function explainRequestFor(
  response: SearchResponse,
): ExplainRequest | null {
  if (response.outcome !== "answered" && response.outcome !== "caveat")
    return null;
  if (response.results.length === 0) return null;
  const { domains, conditions, sort } = response.interpretation;
  const keys = [...new Set(domains.map((d) => d.domain))];
  if (keys.length === 0) return null;
  const axes = [...new Set(conditions.map((c) => c.axis))].slice(
    0,
    EXPLAIN_AXES_MAX,
  );
  return { domains: keys, axes, sort_axis: sort?.axis ?? null };
}
