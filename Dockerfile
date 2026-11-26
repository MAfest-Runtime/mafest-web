# Vite 번들을 한 번만 빌드한다. 런타임 이미지에는 Node.js, 소스, 개발 서버가 없어
# 운영 트래픽이 실수로 Vite 프록시를 사용할 수 없다.
FROM docker.io/library/node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.app.json tsconfig.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY contract ./contract
COPY scripts/generate-answer-validator.mjs ./scripts/

# 운영 번들은 항상 같은 origin의 /v1(mafest-api)을 호출한다. real로 빌드하면 mock 모듈과
# 합성 픽스처가 번들에서 빠진다(src/lib/client.ts). .env는 빌드 컨텍스트에서 제외한다.
ENV VITE_API_MODE=real
RUN npm run build

# 이 이미지는 비특권 포트에서 제공하며 포함된 nginx 비루트 사용자로 실행한다.
FROM docker.io/nginxinc/nginx-unprivileged:1.29.5-alpine@sha256:42a7d7f2ee23e9f5a1dcdf3647ba5c585bbd18f79e79cd817e70e8cd61c55779 AS runtime

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
