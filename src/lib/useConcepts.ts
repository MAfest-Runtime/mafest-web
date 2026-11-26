import type { ConceptRequest } from "./searchPresentation";
import type { ConceptTopic, ExplainResponse, SearchApi } from "./types";
import { useRequest } from "./useRequest";

/**
 * 개념 설명 카드에 쓸 주제. 주제가 없으면 빈 배열이고, 로딩 중이면 `loading`이 참이다.
 * 실패와 빈 응답은 구분하지 않는다 — 둘 다 화면에 아무것도 그리지 않는다.
 */
export interface Concepts {
  topics: ConceptTopic[];
  loading: boolean;
}

/**
 * 최종 검색 응답 하나에 설명을 **한 번만** 요청한다.
 * - 요청 key는 응답의 request_id다. 같은 응답이면 다시 렌더돼도 다시 요청하지 않고, 새 검색(새 request_id)이면
 *   이전 요청을 끊고(AbortController) 늦게 온 이전 응답을 버린다.
 * - 표시 모듈이 개념 설명을 요청할 응답을 골랐을 때만 호출한다.
 * - 설명 실패는 검색을 다시 실행하지 않는다. 재시도도 없다.
 * - 펼치기 같은 화면 조작은 이 훅과 무관하다(상세 설명은 응답에 이미 있다).
 */
export function useConcepts(
  request: ConceptRequest | null,
  api: Pick<SearchApi, "explain"> | undefined,
): Concepts {
  const { state } = useRequest<ExplainResponse>(
    request && api ? `explain:${request.requestId}` : null,
    // useRequest는 키가 null인 경우 로더를 부르지 않는다.
    (signal) => api!.explain(request!.body, signal),
  );
  return {
    topics: state.status === "done" ? state.data.topics : [],
    loading: state.status === "loading",
  };
}
