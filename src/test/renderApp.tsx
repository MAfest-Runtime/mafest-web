import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import App from "../App";
import { streamEventsFor } from "../lib/fixtures";
import { createMockApi } from "../lib/mockApi";
import type { SearchApi, StreamEvent } from "../lib/types";
import { LocationProbe } from "./LocationProbe";

/**
 * 앱을 MemoryRouter 안에서 렌더한다. 기본 API는 지연 0인 mock(합성 픽스처)이다.
 * 특정 응답을 보려면 overrides로 메서드를 바꾼다.
 */
export function testApi(overrides: Partial<SearchApi> = {}): SearchApi {
  const mock = createMockApi(0);
  return {
    search: vi.fn(mock.search),
    getProduct: vi.fn(mock.getProduct),
    getMeta: vi.fn(mock.getMeta),
    explain: vi.fn(mock.explain),
    // search만 바꾼 테스트는 같은 응답(또는 같은 오류)을 스트림으로도 내게 한다.
    searchStream: vi.fn(
      overrides.search
        ? streamFromSearch(overrides.search)
        : (question, signal) => mock.searchStream(question, signal),
    ),
    ...overrides,
  };
}

/** 응답 하나(또는 열기 전 오류)를 정상 스트림으로 바꾼다. search 오류는 스트림을 열기 전 오류와 같다. */
export function streamFromSearch(
  search: SearchApi["search"],
): SearchApi["searchStream"] {
  return async function* (question, signal) {
    const response = await search(question, signal);
    for (const item of streamEventsFor(response))
      yield item as unknown as StreamEvent;
  };
}

export function renderApp({
  api = testApi(),
  path = "/",
}: { api?: SearchApi; path?: string } = {}) {
  const user = userEvent.setup();
  const { unmount } = render(
    <MemoryRouter initialEntries={[path]}>
      <App api={api} />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { user, api, unmount };
}

export function currentLocation(): string {
  return decodeURIComponent(screen.getByTestId("location").textContent ?? "");
}

export function searchPath(question: string): string {
  return `/search?q=${encodeURIComponent(question)}`;
}

/** matchMedia를 흉내 낸다. jsdom에는 없어서 기본은 좁은 화면(카드, 상세 페이지)이다. */
export function setViewport(width: number) {
  const matches = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return min ? width >= Number(min[1]) : false;
  };
  window.matchMedia = ((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

export function resetViewport() {
  // @ts-expect-error 테스트 사이에 jsdom 기본 상태(matchMedia 없음)로 되돌린다.
  delete window.matchMedia;
}
