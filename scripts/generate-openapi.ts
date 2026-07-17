// =============================================================================
// GENERATE OPENAPI STATIC FILES
// Uso: bun run scripts/generate-openapi.ts
// Lê src/lib/endpoints-catalog.ts + src/lib/openapi-spec.ts e escreve:
//   - public/openapi.json
//   - public/openapi.yaml
//   - public/.well-known/openapi.json           (discovery via well-known)
//   - supabase/functions/openapi-spec/spec.json (cópia embarcada p/ edge fn)
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ENDPOINTS } from "../src/lib/endpoints-catalog";
import { buildOpenApiSpec, specToJson, specToYaml } from "../src/lib/openapi-spec";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const spec = buildOpenApiSpec(ENDPOINTS);
const json = specToJson(spec);
const yaml = specToYaml(spec);

const specTs = `// AUTO-GERADO por scripts/generate-openapi.ts — não edite à mão.
// Fonte de verdade: src/lib/endpoints-catalog.ts
// eslint-disable
// deno-lint-ignore-file
export const spec = ${json} as const;
`;

const targets: Array<{ path: string; content: string }> = [
  { path: "public/openapi.json", content: json },
  { path: "public/openapi.yaml", content: yaml },
  { path: "public/.well-known/openapi.json", content: json },
  { path: "supabase/functions/openapi-spec/spec.json", content: json },
  { path: "supabase/functions/openapi-spec/spec.ts", content: specTs },
];

for (const t of targets) {
  const abs = resolve(root, t.path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, t.content, "utf8");
  console.log("wrote", t.path, `(${t.content.length} bytes)`);
}

console.log("\nOK — OpenAPI spec regenerado a partir de src/lib/endpoints-catalog.ts");
