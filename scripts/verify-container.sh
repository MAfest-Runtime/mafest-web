#!/usr/bin/env bash
set -euo pipefail

# 실제 배포 대상과 같은 이미지를 빌드하고 검사한다. x86_64가 아닌 호스트에서는 Docker
# Desktop이 linux/amd64를 에뮬레이션할 수 있으므로, 인수인계 기록용으로 두 아키텍처를 출력한다.

# 검사 도구가 없으면 `if <도구> ...` 형태의 금지 패턴 검사가 "매치 없음"으로 통과해 버린다.
# 조용히 무력화되지 않도록 먼저 확인하고 멈춘다.
for tool in docker curl grep tar awk mktemp; do
  if ! command -v "$tool" > /dev/null 2>&1; then
    echo "필요한 도구가 없습니다: ${tool}" >&2
    exit 1
  fi
done

# 기본은 "빌드한 뒤 검사"다. --no-build는 이미 존재하는 이미지를 그대로 검사한다.
# registry에서 digest로 pull한 이미지는 빌드 대상이 아니므로, 게시된 이미지를 검증하려면
# 빌드 단계를 건너뛸 수 있어야 한다. 기본 동작은 그대로 두어 기존 호출 방식이 깨지지 않게 한다.
build_image=true
image=""
for arg in "$@"; do
  case "$arg" in
    --no-build) build_image=false ;;
    -*)
      echo "알 수 없는 옵션: ${arg}" >&2
      echo "사용법: $(basename "$0") [--no-build] [image]" >&2
      exit 1
      ;;
    *)
      if [[ -n "$image" ]]; then
        echo "image는 하나만 지정합니다: ${image}, ${arg}" >&2
        exit 1
      fi
      image="$arg"
      ;;
  esac
done
image="${image:-mafest-web:container-verify}"

requested_port="${MAFEST_WEB_VERIFY_PORT:-}"
container="mafest-web-verify-$$"
export_container="${container}-image"
workdir="$(mktemp -d)"

cleanup() {
  docker rm -f "$container" "$export_container" >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

request() {
  curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 "$@"
}

echo "host architecture: $(uname -m)"
echo "Docker server: $(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')"
echo "image: ${image}"

if [[ "$build_image" == true ]]; then
  echo "mode: 빌드 후 검사 (build target linux/amd64)"
  docker buildx build --platform linux/amd64 --load --tag "$image" .
else
  echo "mode: 기존 이미지 검사 (빌드하지 않음)"
  # 이미지가 없으면 "검사할 것이 없다"가 아니라 실패다. pull이 빠진 상태를 통과로 남기지 않는다.
  if ! docker image inspect "$image" > /dev/null 2>&1; then
    echo "로컬에 이미지가 없습니다: ${image}" >&2
    echo "먼저 pull 하세요: docker pull ${image}" >&2
    exit 1
  fi
fi

image_platform="$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')"
image_user="$(docker image inspect "$image" --format '{{.Config.User}}')"
[[ "$image_platform" == "linux/amd64" ]]
[[ -n "$image_user" && "$image_user" != "0" && "$image_user" != "root" ]]

# 최종 파일시스템에는 빌드 입력이나 머신별 설정이 남아 있으면 안 된다.
# 검사 규칙은 회귀 테스트가 붙은 check-image-listing.sh가 소유한다. 0=금지 경로 발견,
# 1=깨끗, 2=검사 자체 실패이며, 2를 "깨끗함"으로 넘기지 않는 것이 이 분기의 요점이다.
docker create --platform linux/amd64 --name "$export_container" "$image" >/dev/null
docker export "$export_container" > "$workdir/image.tar"
tar -tf "$workdir/image.tar" > "$workdir/files.txt"
listing_rc=0
bash "$(dirname "$0")/check-image-listing.sh" "$workdir/files.txt" || listing_rc=$?
case "$listing_rc" in
  0)
    echo "runtime image contains a build input or local configuration" >&2
    exit 1
    ;;
  1) ;;
  *)
    echo "금지 경로 검사를 완료하지 못했습니다 (exit ${listing_rc})" >&2
    exit 1
    ;;
esac

publish_args=(--publish "127.0.0.1::8080")
if [[ -n "$requested_port" ]]; then
  publish_args=(--publish "127.0.0.1:${requested_port}:8080")
fi

docker run --detach --rm --name "$container" --platform linux/amd64 \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,uid=101,gid=101,mode=1777 \
  "${publish_args[@]}" \
  "$image" >/dev/null
port="$(docker port "$container" 8080/tcp | awk -F: 'NR == 1 { print $NF }')"
base_url="http://127.0.0.1:${port}"

healthy=false
for _ in {1..20}; do
  if request "${base_url}/healthz" > /dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  docker logs "$container" >&2 || true
  echo "컨테이너가 health 응답 준비를 마치지 못했습니다." >&2
  exit 1
fi

request --dump-header "$workdir/health.headers" \
  "${base_url}/healthz" > "$workdir/health.body"
grep -qiE '^cache-control:.*no-store' "$workdir/health.headers"
[[ "$(<"$workdir/health.body")" == "ok" ]]

request --dump-header "$workdir/index.headers" \
  "${base_url}/" > "$workdir/index.html"
grep -qiE '^cache-control:.*no-cache' "$workdir/index.headers"
grep -qiE '^x-robots-tag:.*noindex' "$workdir/index.headers"
grep -q 'name="robots" content="noindex' "$workdir/index.html"

# 검색엔진 수집 차단(mafest 37 §0).
request "${base_url}/robots.txt" > "$workdir/robots.txt"
grep -qx 'Disallow: /' "$workdir/robots.txt"

grep -oE '"/assets/[^"?]+' "$workdir/index.html" | tr -d '"' > "$workdir/assets.txt"
[[ -s "$workdir/assets.txt" ]]
while IFS= read -r asset; do
  request --dump-header "$workdir/asset.headers" \
    "${base_url}${asset}" > /dev/null
  grep -qiE '^cache-control:.*immutable' "$workdir/asset.headers"
done < "$workdir/assets.txt"

missing_asset="${base_url}/assets/missing-deploy-asset.js"
missing_asset_status="$(curl --silent --output /dev/null --dump-header "$workdir/missing-asset.headers" \
  --write-out '%{http_code}' "$missing_asset")"
[[ "$missing_asset_status" == "404" ]]
grep -qiE '^cache-control:.*no-store' "$workdir/missing-asset.headers"
if grep -qiE '^cache-control:.*immutable' "$workdir/missing-asset.headers"; then
  echo "누락 자산 응답에 immutable cache를 설정하면 안 됩니다." >&2
  exit 1
fi

for path in /missing-static-file /v1 /v1/search /products /products/kr_etf /search/extra; do
  [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "${base_url}${path}")" == "404" ]]
done

# 클라이언트 라우트는 앱 셸을 받아야 새로고침과 딥링크가 동작한다. 위의 404 검사와
# 함께 두어, fallback 범위가 앱 라우트 밖으로 넓어지면 바로 드러나게 한다.
for path in /search "/search?q=%EA%B5%AD%EB%82%B4%20ETF" /about /products/kr_etf/SMP001; do
  request --dump-header "$workdir/route.headers" \
    "${base_url}${path}" > "$workdir/route.html"
  grep -qiE '^content-type:.*text/html' "$workdir/route.headers"
  grep -qiE '^cache-control:.*no-cache' "$workdir/route.headers"
  grep -qiE '^x-robots-tag:.*noindex' "$workdir/route.headers"
  grep -q 'id="root"' "$workdir/route.html"
done

[[ "$(docker exec "$container" id -u)" != "0" ]]
docker cp "$container:/usr/share/nginx/html" "$workdir/site"
# 금지 경로 검사와 같은 이유로 grep의 1(매치 없음)과 2 이상(검사 오류)을 구분한다.
bundle_rc=0
# SAMPLE·DEMO·mock-는 합성 픽스처의 표식이다. 운영 번들(VITE_API_MODE=real)에서는
# client.ts의 조건이 상수로 접혀 mock 모듈이 빠져야 한다.
grep -rnE 'VITE_LOCAL_API_TARGET|127\.0\.0\.1:8000|SAMPLE 코스피200|mock-answered-|mock-session|mock-secret|sample-session-' \
  "$workdir/site" || bundle_rc=$?
case "$bundle_rc" in
  0)
    echo "runtime bundle contains a local API setting or mock fixtures" >&2
    exit 1
    ;;
  1) ;;
  *)
    echo "번들 비밀값 검사를 완료하지 못했습니다 (grep exit ${bundle_rc})" >&2
    exit 1
    ;;
esac

if [[ "$build_image" == true ]]; then
  verified_mode="빌드 후 검사"
else
  verified_mode="기존 이미지 검사"
fi
echo "container verification passed (${verified_mode}): ${image}, ${image_platform}, user ${image_user}"
