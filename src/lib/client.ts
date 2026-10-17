import { httpApi } from "./api";
import type { SearchApi } from "./types";

/**
 * 앱이 쓰는 API. mock은 개발자가 `VITE_API_MODE=mock`을 명시했을 때만 쓴다.
 * 실제 API 오류를 mock 성공으로 바꾸지 않는다.
 *
 * `import.meta.env.VITE_API_MODE`는 빌드 때 문자열로 바뀐다. 운영 이미지는
 * VITE_API_MODE=real로 빌드하므로 아래 비교가 false로 접히고, mock 모듈과 합성
 * 픽스처가 번들에서 빠진다(container:verify가 번들에 "SAMPLE"이 없는지 검사한다).
 */
export const IS_MOCK = import.meta.env.VITE_API_MODE === "mock";

function lazyMock(): SearchApi {
  const load = () => import("./mockApi").then((m) => m.mockApi);
  return {
    search: (question, signal, runKey) =>
      load().then((api) => api.search(question, signal, runKey)),
    confirm: (request, signal) =>
      load().then((api) => api.confirm(request, signal)),
    getProduct: (domain, id, signal) =>
      load().then((api) => api.getProduct(domain, id, signal)),
    getMeta: (signal) => load().then((api) => api.getMeta(signal)),
    explain: (body, signal) => load().then((api) => api.explain(body, signal)),
    searchStream: (question, signal, runKey) =>
      (async function* () {
        const api = await load();
        yield* api.searchStream(question, signal, runKey);
      })(),
  };
}

export const api: SearchApi = IS_MOCK ? lazyMock() : httpApi;
