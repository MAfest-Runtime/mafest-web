# mafest-web — 에이전트 지침

작업 공간의 공통 지침과 함께 읽는다. 이 저장소에는 제품 소스·개발 mock·정본 계약·패키지 잠금·빌드 설정·Dockerfile·nginx 설정만 둔다.

## 기록 위치

작업 계획·검토·실험 결과·인수인계·운영 런북은 persona-ops-lab 의 `repos/<원본 저장소 이름>/` 아래에 기록한다.
제품 저장소 README 에는 진행·예정·작업 이력을 쌓지 않는다.
실제 자격·사용자 원문·원본 로그는 이관하거나 커밋하지 않는다.
ops-lab 에 접근할 수 없으면 다른 저장소에 영구 사본을 만들지 말고, 미기록 상태와 필요한 경로를 인계한다.

- 웹 시험·컨테이너 검증·이미지 빌드와 게시 workflow 는 persona-ops-lab 의 `repos/mafest-web/` 와 `.github/workflows/web-image.yml` 에 있다. 이 저장소에 시험이나 CI 사본을 다시 두지 않는다.
- 정본 OpenAPI 계약(`contract/`)은 이 저장소에서 읽는다. 시험 사본을 별도 정본으로 늘리지 않는다.
