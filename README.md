# mafest-web

금융상품 질의 검색 데모의 웹이다. 질문을 받아 `mafest-api`의 `/v1`을 부르고, 답변·해석한 조건·상품 표·"어떻게 답했나"를 보여 준다.
로그인이 없는 공개 웹이며 DB·모델 서버에 직접 접속하지 않는다.

이 레포에는 데이터가 없다. mock 픽스처(`src/lib/fixtures.ts`)는 전부 **합성 값**(SAMPLE·DEMO 상품, 지어낸 수치·건수·테이블 이름)이다. 실제 응답을 복사해 넣지 않는다.

## 화면

주소는 `/`(검색창, 예시 질문), `/search?q=`(결과와 "어떻게 답했나"), `/products/:domain/:id`(상품 상세), `/about`(동작 방식·한계)이다.

- 검색은 `POST /v1/search/stream`(SSE)이 기본이다. 해석 미리보기, 해석 카드, 결과 표, 답변 문장, 후속 질문 칩이 도착 순서대로 나타나고 `done`에서 화면이 확정된다.
- 해석 미리보기(`interpretation_draft`)는 서버가 켠 경우에만 온다. 확정 전 값이라 최종 해석이 오면 해석 카드로 바뀐다. 없어도 화면은 같게 동작한다.
- 스트림을 열기 전에 쓸 수 없으면 `POST /v1/search`로 한 번 대신한다. 도중에 끊기면 1초 뒤 한 번만 다시 받고, 두 번째도 끊기면 연결 실패 화면을 낸다.
- outcome 9종과 HTTP 429·504·5xx·연결 실패를 각각 다른 화면으로 그린다. `generated_by=fallback`이면 전용 배너를 보인다.
- 기준 확인이 필요하면 상품 조회 없이 확인 화면이 뜨고, 답은 `POST /v1/search/confirm`으로 보낸다. 세션 secret과 답은 React 상태에만 있다.
- 상태는 URL에만 있다. 새로고침·뒤로가기·링크 공유가 그대로 되고, 색인은 막는다.

화면 상태와 재시도 규칙은 `src/lib/searchStream.ts`, `src/lib/useSearchRun.ts`, `src/lib/sse.ts`, `src/lib/useConfirmSubmit.ts`의 설명에 있다. 해석·답변 설명 규칙은 `src/lib/explain.ts`에 있다.

## 로컬 실행

Node 22.23.1 기준.

```sh
nvm use && npm ci
VITE_API_MODE=mock npm run dev   # mock
VITE_API_MODE=real VITE_LOCAL_API_TARGET=http://127.0.0.1:18080 npm run dev   # 로컬 API(주소는 브라우저에 전송되지 않는다)
```

운영 번들(`VITE_API_MODE=real`)에는 mock 모듈과 픽스처가 들어가지 않는다(`src/lib/client.ts`). 실제 API 오류를 mock 응답으로 바꾸지 않는다.

### mock 모드

질문 낱말로 픽스처를 고른다(`src/lib/mockApi.ts`). 스트림도 같은 규칙으로 고른 응답을 시간차로 흘린다.

| 질문에 들어간 말             | 화면                |
| ---------------------------- | ------------------- |
| (그 밖)                      | answered            |
| 퇴직연금, ETN                | caveat              |
| 0.01%, 50%                   | no_result           |
| 공부 중인데                  | unread              |
| 과거, 추이, 이력, 호가, 시세 | not_collected       |
| 편입, 구성종목               | unavailable         |
| 좋은, 괜찮은                 | ambiguous           |
| 추천, 오를, 전망             | refused             |
| 오류                         | error               |
| 모델                         | answered + fallback |
| 몇 개 / 채권·AA·표면금리     | 개수 / 채권 결과    |
| 429 / 504 / 500              | HTTP 실패           |

스트림 장애는 아래 말로 고른다.

| 질문에 들어간 말 | 스트림에서 일어나는 일                     |
| ---------------- | ------------------------------------------ |
| 모델             | 답 생성 시한 초과, `generated_by=fallback` |
| 전체 시한        | 표 뒤에 `error`(timeout) 이벤트 → 504 화면 |
| 끊김             | 첫 요청만 끊김 → 1초 뒤 재시도 → 정상      |
| 계속 끊김        | 재시도도 끊겨 연결 실패 화면               |
| 스트림 불가      | `POST /v1/search`로 대신함                 |
| 미리보기 없음    | `interpretation_draft` 없이 보냄           |

확인 화면은 "안전한 국내 ETF 5개 보여줘"로 볼 수 있다(`src/lib/mockConfirm.ts`). 답변에 "전송실패", "처리중", "충돌", "만료", "미지원"을 넣으면 각 오류 안내가 나온다.

## 검증

`npm run lint`, `format:check`, `typecheck`, `build`를 실행한다. 시험과 검증 도구는 별도 비공개 저장소에서 관리한다.

## API 계약

- 정본은 이 레포의 `contract/public-api-v1.openapi.yaml`(OpenAPI 3.1, 현재 1.6.0)이다.
- mafest-agent는 이 파일을 `tests/contract/`로 복사해 실제 응답을 같은 스키마로 검사한다. 사본은 정본과 바이트 단위로 같아야 한다.
- 웹 쪽 구현은 `src/lib/types.ts`(타입)와 `src/lib/validate.ts`(받는 즉시 검사)다. 응답이 계약과 다르면 "응답 형식 오류"로 보인다.
- yaml을 고치면 types·validate·픽스처를 함께 고친다.

## 배포

- 이미지는 이 레포가 아니라 별도 비공개 저장소의 워크플로로 빌드한다.
- 컨테이너는 비루트 nginx(8080), read-only rootfs + `/tmp` tmpfs, `/healthz`(no-store)다. `/v1`은 Traefik이 `mafest-api`로 보내며(같은 origin) 여기서는 404다.
- 앱 라우트(`/search`, `/about`, `/products/<d>/<id>`)만 index.html로 되돌린다. 라우트를 추가하면 `nginx/default.conf`를 고친다.
- 사이트 이름에 특정 금융회사 이름·로고·색을 쓰지 않는다. 문구는 `src/lib/site.ts` 한곳에 있다.

## 알려진 제한

- 최초 검색은 SSE가 기본이고 확인 답변 제출은 JSON이다.
- 해석 미리보기는 서버가 LLM 출력을 점진적으로 읽어 보낸다. 답변 문장은 서버가 모델 출력을 문장 단위로 검증한 뒤 보내며, 화면은 도착한 순서를 그대로 그린다.
- 같은 `Idempotency-Key` 재전송은 새 해석이 아니다. 서버가 응답을 재생해 주는지는 웹에서 보장하지 못한다.
- 오류 결과(`outcome: "error"`)를 받아도 서버 쪽 저장 성공은 보장되지 않는다.
- 새로고침하면 확인은 처음부터 다시 시작한다.
