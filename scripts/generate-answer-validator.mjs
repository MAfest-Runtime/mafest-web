import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standalone from "ajv/dist/standalone/index.js";
import { build } from "esbuild";
import { format } from "prettier";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../", import.meta.url));
const contract = new URL(
  "../contract/public-api-v1.openapi.yaml",
  import.meta.url,
);
const directory = new URL("../src/lib/generated/", import.meta.url);
const target = new URL("answer-validator.mjs", directory);
const { components } = parse(await readFile(contract, "utf8"));
const definitions = Object.create(null);

/** Answer에서 실제로 참조하는 스키마를 JSON Schema 문서 안으로 옮긴다. */
function localizeReferences(node) {
  if (Array.isArray(node)) return node.map(localizeReferences);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === "$ref" ? localReference(value) : localizeReferences(value),
    ]),
  );
}

function localReference(reference) {
  const name = /^#\/components\/schemas\/([A-Za-z0-9_]+)$/.exec(reference)?.[1];
  if (!name || !Object.hasOwn(components.schemas, name))
    throw new Error(`답변 검증에서 읽을 수 없는 스키마 참조: ${reference}`);
  if (!Object.hasOwn(definitions, name)) {
    // 같은 참조나 순환 참조가 나오면 이미 등록한 이름을 사용한다.
    definitions[name] = true;
    definitions[name] = localizeReferences(components.schemas[name]);
  }
  return `#/$defs/${name}`;
}

const schema = {
  $ref: localReference("#/components/schemas/Answer"),
  $defs: definitions,
};
const ajv = new Ajv2020({
  code: { source: true, esm: true, lines: true },
  messages: false,
  strict: true,
});
const source = standalone(ajv, ajv.compile(schema));

// Ajv가 생성한 보조 함수까지 묶어 Vite와 테스트가 동일한 ESM 검증기를 가져오게 한다.
const { outputFiles } = await build({
  absWorkingDir: root,
  stdin: { contents: source, resolveDir: root, sourcefile: "answer-validator" },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const banner =
  "// OpenAPI 정본에서 생성한다. npm run contract:generate-answer\n";
const output = await format(banner + outputFiles[0].text, { parser: "babel" });

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? await readFile(target, "utf8") : "";
  if (current.replaceAll("\r\n", "\n") !== output) {
    throw new Error(
      "답변 검증기가 정본과 다릅니다. npm run contract:generate-answer를 실행하세요.",
    );
  }
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(target, output, "utf8");
}
