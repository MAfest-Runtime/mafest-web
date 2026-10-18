import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const localApiTarget = env.VITE_LOCAL_API_TARGET;

  return {
    plugins: [react()],
    build: {
      // 4 kB 미만 자산은 기본적으로 CSS에 base64로 박힌다. 글꼴 서브셋이 그렇게 들어가면
      // unicode-range가 맞지 않아 쓰지 않는 글자 구간까지 첫 로드 CSS에 실리고, base64는
      // gzip으로 거의 줄지 않는다. woff2는 늘 별도 파일로 두고 나머지는 기본 규칙을 따른다.
      assetsInlineLimit: (filePath: string) =>
        filePath.endsWith(".woff2") ? false : undefined,
    },
    server: localApiTarget
      ? {
          proxy: {
            "/v1": {
              target: localApiTarget,
              changeOrigin: true,
            },
          },
        }
      : undefined,
  };
});
