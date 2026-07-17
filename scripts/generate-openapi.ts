// =============================================================================
// GENERATE OPENAPI STATIC FILES
// Uso: bun run scripts/generate-openapi.ts
// Lê src/lib/endpoints-catalog.ts + src/lib/openapi-spec.ts e escreve:
//   - public/openapi.json
//   - public/openapi.yaml
//   - public/.well-known/openapi.json           (discovery via well-known)
//   - supabase/functions/openapi-spec/spec.json (referência)
//   - supabase/functions/openapi-spec/index.ts  (self-contained: spec inline)
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

// index.ts self-contained — o dashboard do Supabase só envia o index.ts para
// bundling, então qualquer import relativo (./spec.ts, ./spec.json) quebra.
// Solução: embutir o spec como constante dentro do próprio index.ts.
const indexTs = `// =============================================================================
// EDGE FUNCTION: openapi-spec
// AUTO-GERADO por scripts/generate-openapi.ts — NÃO EDITE À MÃO.
// Fonte de verdade: src/lib/endpoints-catalog.ts
//
// Self-contained: o spec está inline abaixo para compatibilidade com o deploy
// via dashboard do Supabase (que faz upload apenas do index.ts, sem arquivos
// auxiliares).
// =============================================================================

// deno-lint-ignore-file no-explicit-any
/* eslint-disable */

const spec = ${json} as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type, apikey, accept",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SELF_URL = "https://api-booking.zailom.com/openapi/live";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const wantsYaml =
    url.pathname.endsWith(".yaml") ||
    url.pathname.endsWith(".yml") ||
    (req.headers.get("accept") || "").includes("yaml");

  if (wantsYaml) {
    return new Response(
      JSON.stringify({
        error: "use_json_endpoint",
        hint: "YAML disponível em booking.zailom.com/openapi.yaml (static).",
      }),
      {
        status: 406,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify(spec), {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "application/vnd.oai.openapi+json;version=3.1",
      "cache-control": "public, max-age=300",
      "link": \`<\${SELF_URL}>; rel="service-desc"; type="application/vnd.oai.openapi+json"\`,
      "x-openapi-version": (spec as any)?.info?.version ?? "unknown",
    },
  });
});
`;

const targets: Array<{ path: string; content: string }> = [
  { path: "public/openapi.json", content: json },
  { path: "public/openapi.yaml", content: yaml },
  { path: "public/.well-known/openapi.json", content: json },
  { path: "supabase/functions/openapi-spec/spec.json", content: json },
  { path: "supabase/functions/openapi-spec/index.ts", content: indexTs },
];

for (const t of targets) {
  const abs = resolve(root, t.path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, t.content, "utf8");
  console.log("wrote", t.path, `(${t.content.length} bytes)`);
}

console.log("\nOK — OpenAPI spec regenerado a partir de src/lib/endpoints-catalog.ts");
