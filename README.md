# mafest-web

금융상품 질의 검색 데모의 웹이다. 질문을 받아 `mafest-api`의 `/v1`을 부르고, 답변·해석한 조건·상품 표·"어떻게 답했나"를 보여 준다.
로그인이 없는 공개 웹이며 DB·모델 서버에 직접 접속하지 않는다. 설계 근거는 mafest `docs/plans/37_공개웹_최종계획.md` §2·§3·§5다.

이 레포에는 데이터가 없다. mock 픽스처(`src/lib/fixtures.ts`)는 전부 **합성 값**(SAMPLE·DEMO 상품, 지어낸 수치·건수·테이블 이름)이다. 실제 응답을 복사해 넣지 않는다.

## 화면

| 주소                     | 화면                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| `/`                      | 검색창, 예시 질문 칩(`/v1/meta`), 상품군별 건수·기준일                  |
| `/search?q=`             | 답변, 해석한 조건, 상품 표(넓은 화면)·카드(좁은 화면), 어떻게 답했나    |
| `/search?q=&p=도메인/id` | 넓은 화면에서 결과 오른쪽 패널에 상품 상세                              |
| `/products/:domain/:id`  | 상품 상세(좁은 화면 또는 직접 링크). 값별 출처·기준일, 관계 → 관련 검색 |
| `/about`                 | 동작 방식, 데이터 범위, 한계, 기록 정책, 비공식 고지                    |

- 결과 화면은 ① 질문 해석(질문 표현에 번호 밑줄 → "표현 → 대상·조건·정렬·개수 → 사전 일치·패턴·규칙·기본값" 목록, 해석 결과 문장, 상품군 상태) ② 어떻게 답했나(해석→조회→판정→생성→검증 5단계, 판정 설명, 단계별 시간 막대, 접힌 세부 기록) ③ 답변·표 순서다. 답변 속 인용 상품명·숫자는 표의 그 행·칸과 이어진다. 좁은 화면은 ①을 늘 보이고 ②·③을 [결과 | 처리 과정]으로 전환한다. 규칙은 `src/lib/explain.ts` 한곳에 있다.
- 검색은 `POST /v1/search/stream`(SSE)이 기본이고, 화면은 도착 순서대로 바뀐다: 해석 카드 → 결과 표·그래프 → 답변 문장이 하나씩 덧붙음(`aria-live="polite"`) → 최종 답으로 덮음 → 후속 질문 칩 → `done`의 완성 응답으로 화면 전체 확정(답변↔표 인용 연결 포함). 이벤트는 도착하는 대로 기존 `validateStreamEvent`·`validateStream`으로 검사하고, 계약과 어긋난 것은 그리지 않고 "응답 형식 오류" 화면으로 간다. 구현은 `src/lib/api.ts`(호출·검사), `src/lib/sse.ts`(SSE 파서), `src/lib/searchStream.ts`(재시도·대체 경로), `src/lib/useSearchRun.ts`(화면 상태), `src/lib/useConfirmSubmit.ts`(확인 답변 제출 상태).
- 스트림을 열기 전에 쓸 수 없다고 판명되면(응답이 `text/event-stream`이 아님, 열기 전 연결 실패, 404·5xx) `POST /v1/search`로 한 번 대신한다. 422·429·504는 대신하지 않고 기존 오류 화면 규칙을 따른다.
- 답 요약은 최대 600자·5문장이다(`answer.text`). 표 아래 "알아두면 좋은 개념"은 최종 응답(`done`) 뒤에 `POST /v1/explain`을 검색 실행당 **한 번만** 불러 그린다(`src/lib/useConcepts.ts`, `src/components/ConceptCards.tsx`). 자세히 보기는 응답에 든 상세 설명을 펼칠 뿐 요청을 보내지 않고, 실패하거나 주제가 없으면 아무것도 그리지 않으며 검색을 다시 실행하지 않는다. 후속 질문 칩(검색 실행용)과 섞이지 않는다.
- 스트림이 `done`·`error` 없이 끊기면 1초 뒤 새 요청으로 **한 번만** 다시 받는다. 그동안 답 문장 영역은 비워 잘린 답과 새 답이 섞이지 않게 하고(표는 그대로), 두 번째도 끊기면 연결 실패 화면을 낸다. `error` 이벤트와 계약 위반은 다시 요청하지 않는다. 새 질문이나 페이지 이탈은 진행 중인 스트림과 대기 중인 재시도를 취소한다.
- ping을 포함해 새 바이트가 30초 동안 없으면 연결이 끊긴 것으로 보고 같은 1회 재시도 규칙을 적용한다. `done`·`error`를 받으면 서버가 연결을 닫을 때까지 기다리지 않고 본문 reader를 즉시 취소한다.
- 상태는 URL에만 있다. 새로고침·뒤로가기·링크 공유가 그대로 된다.
- outcome 9종(`answered` `caveat` `no_result` `not_collected` `unread` `unavailable` `ambiguous` `refused` `error`)과 HTTP 429(Retry-After 카운트다운)·504·5xx·연결 실패를 각각 다른 화면으로 그린다. `generated_by=fallback`이면 전용 배너·생성 방식 배지·처리 기록은 표시하지 않고 답변·표·기준일·데이터 고지는 유지한다. API의 생성 방식과 진단 기록은 바꾸지 않으며 AI 생성 성공으로 표시하지 않는다.
- 숫자는 오른쪽 정렬·고정폭. 수익률은 색 없이 부호로만.
- 기준일은 상품군마다 다르다. 같으면 하나로, 다르면 상품군별로 나열한다.
- 상품 상세에 "이전/다음 상품"이나 상품군 전체 목록은 두지 않는다(대량 수집 억제).
- `robots.txt` `Disallow: /`, `<meta name="robots" content="noindex">`, nginx `X-Robots-Tag`로 색인을 막는다.

## 로컬 실행

Node 22.23.1 기준.

```sh
nvm use
npm ci
VITE_API_MODE=mock npm run dev
```

### 기준 확인(멀티턴)

서버가 최초 검색(`POST /v1/search/stream` 또는 `POST /v1/search`)에서 기준 확인이 필요하다고 판단하면 상품 조회·요약 없이 `ConfirmationRequired`를 돌려준다(공개 계약 1.5.0). 별도 "확인 시작" 요청은 없고, 이 응답이 곧 확인 대기라서 같은 질문이 두 번 해석되지 않는다.

- SSE는 `start → (interpretation) → confirmation_required`로 `done` 없이 정상 종료한다. 끊김이 아니므로 자동 재시도를 하지 않고, 결과·답변이 없는 이 상태를 검색 성공으로 그리지 않는다. JSON 검색은 `{kind: "confirmation_required", confirmation}`을 준다.
- 최초 검색 실행마다 `Idempotency-Key`를 만든다. 같은 실행의 스트림 재시도·JSON 대체는 같은 키를 쓰고, 새 질문·"처음부터 다시 확인"은 새 키다. 서버가 같은 키의 해석·확인 응답을 재생해 주기 전에는 서버에서 새 LLM 경로를 켜면 안 된다(웹은 재생을 보장하지 못한다).
- 답은 `POST /v1/search/confirm`(`Idempotency-Key`, `X-Session-Secret`, 본문 `session_id`·`version`·`action`·`answer`)으로만 보낸다. 원 질문에 답을 붙여 새로 검색하지 않는다. 한 번의 제출이 하나의 키이고, 전송 결과를 모르면 사용자가 누를 때만 **처음 요청 그대로** 다시 보낸다.
- 409는 code로 가른다(최초 검색과 확인 제출 모두). `turn_in_progress`는 "기존 요청을 처리하고 있습니다" 안내이고, HTTP는 `Retry-After`, 이미 열린 SSE의 error 이벤트는 헤더가 없어 고정 2초 동안 재전송 버튼을 잠근 뒤 **사용자가 누를 때만** 같은 요청(같은 키·같은 본문)을 다시 보낸다. `session_conflict`·`turn_indeterminate`는 영구 종료라 재전송 버튼 없이 새 검색(새 키)만 연다. 410 `session_expired`·501 `confirm_unsupported`도 종료 안내다. 모르는 오류 code를 처리 중으로 추측하지 않는다.
- 세션 secret과 답은 React 상태에만 있고 URL·콘솔·저장소에 남기지 않는다. 새로고침하면 확인은 처음부터 새로 시작한다.

mock 모드(`VITE_API_MODE=mock`)에서는 "안전한 국내 ETF 5개 보여줘"를 검색하면 확인 화면이 뜬다(`src/lib/mockConfirm.ts`, 합성 값). 답변에 "전송실패"를 넣으면 첫 전송이 끊겨 "같은 요청 다시 보내기"를, "처리중"은 409 처리 중을, "충돌"·"만료"·"미지원"은 각각의 종료 안내를 볼 수 있다. 실서버·실DB·실LLM을 확인한 것이 아니다.

mock 모드는 질문 낱말로 픽스처를 고른다(`src/lib/mockApi.ts`). 스트림도 같은 규칙으로 고른 응답을 이벤트로 나눠 시간차로 흘린다.

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

스트림 mock은 아래 말로 장애를 고른다.

| 질문에 들어간 말 | 스트림에서 일어나는 일                                        |
| ---------------- | ------------------------------------------------------------- |
| 모델             | 답 생성 시한 초과: 문장 없이 `generated_by=fallback`으로 끝남 |
| 전체 시한        | 표를 보낸 뒤 `error`(timeout) 이벤트 → 504 화면               |
| 끊김             | 첫 요청만 문장 하나 뒤 끊김 → 1초 뒤 재시도 → 정상            |
| 계속 끊김        | 매번 끊김 → 재시도도 끊겨 연결 실패 화면                      |
| 스트림 불가      | 스트림을 쓸 수 없어 `POST /v1/search`로 대신함                |

실제 API를 붙일 때는 로컬 API 주소를 준다(브라우저에는 전송되지 않는다).

```sh
VITE_API_MODE=real VITE_LOCAL_API_TARGET=http://127.0.0.1:18080 npm run dev
```

실제 API 오류를 mock 응답으로 바꾸지 않는다. 운영 번들(`VITE_API_MODE=real`)에는 mock 모듈과 픽스처가 들어가지 않는다(`src/lib/client.ts`, `container:verify`가 검사).

## 검증

```sh
npm run lint
npm run format:check
npm run typecheck
npm test               # 화면·계약·api 테스트. 실연동은 [미실행]으로 표시된다
npm run build
npm run test:scripts   # 이미지 금지 경로 검사의 회귀 테스트
npm run container:verify   # Docker 필요. linux/amd64 이미지를 빌드해 검사
```

테스트 3층:

| 층        | 파일                                                                              | 보는 것                                                         |
| --------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 화면      | `src/App.test.tsx`                                                                | 합성 API로 화면 로직(outcome 9종, 상세, 429, URL)               |
| 스트림    | `src/lib/stream.test.ts`, `src/App.stream*.test.tsx`, `src/specialChars.test.tsx` | SSE 파서, 스트림 호출·재시도·대체, 표시 순서, 취소, 특수문자    |
| API 계약  | `src/lib/validate.test.ts`, `src/lib/api.test.ts`                                 | 픽스처가 계약을 지키는지, 요청 형태와 실패 처리                 |
| 실제 HTTP | `src/lib/api.live.test.ts`                                                        | `MAFEST_LIVE_API=<주소>`일 때만. 예시 칩 6개의 기대 outcome(W6) |

## API 계약

- 기계 정본: `contract/public-api-v1.openapi.yaml`(OpenAPI 3.1). 값 채우는 규칙은 작업 공간 `docs/repos/mafest/plans/39_공개API_명세.md`.
- 웹 쪽 구현: `src/lib/types.ts`(타입)와 `src/lib/validate.ts`(받는 즉시 검사). 응답이 계약과 다르면 성공처럼 그리지 않고 "응답 형식 오류"로 보인다.
- `src/contract.test.ts`가 합성 픽스처 전부를 yaml 스키마로 검사한다. yaml을 고치면 types·validate·픽스처를 함께 고친다.
- mafest(P7)는 이 yaml을 `tests/contract/`로 복사해 실제 응답을 같은 스키마로 검사한다. 사본은 이 파일과 **바이트 단위로 같아야** 하고 `src/contract.test.ts`의 `CONTRACT_SHA256`과 같은 값을 고정한다(1.5.0: 기준 확인 `ConfirmationRequired`·`POST /v1/search/confirm`·`Idempotency-Key`; 1.4.0: 600자 상한, `POST /v1/explain`).

## 배포

- 이미지: 비루트 nginx(8080), read-only rootfs + `/tmp` tmpfs, `/healthz`(no-store).
- `/v1`은 이 컨테이너가 아니라 Traefik이 `mafest-api`로 보낸다(같은 origin, CORS 없음). 여기서는 404.
- 앱 라우트(`/search`, `/about`, `/products/<d>/<id>`)만 index.html로 되돌린다. 라우트를 추가하면 `nginx/default.conf`와 `scripts/verify-container.sh`를 함께 고친다.
- 사이트 이름에 특정 금융회사 이름·로고·색을 쓰지 않는다. 문구는 `src/lib/site.ts` 한곳에 있다.

## 남은 일

- W6: P7(공개 API) 뒤 실 API 연결, `api.live.test.ts`로 예시 칩 6개 실측.
- 단계 스트리밍(SSE)은 v1.1 선택 항목이다.
