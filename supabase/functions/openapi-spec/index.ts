// =============================================================================
// EDGE FUNCTION: openapi-spec
// Serve o documento OpenAPI 3.1 da API pública do Zailom Booking.
// - CORS liberado (público)
// - Fonte: spec.json embarcado (gerado por `bun run scripts/generate-openapi.ts`)
// - Exposto também em https://api-booking.zailom.com/openapi/live via Traefik+nginx
// - Header `Link: <...>; rel="service-desc"` (RFC 8631) aponta para o próprio doc
// =============================================================================

// deno-lint-ignore-file no-explicit-any
// Lê o spec.json em runtime (evita depender de "import attributes",
// que exigem tsconfig module=esnext/nodenext/preserve — não suportado
// pelo editor de Edge Functions do Supabase).
const specUrl = new URL("./spec.json", import.meta.url);
const specText = await Deno.readTextFile(specUrl);
const spec: Record<string, any> = JSON.parse(specText);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type, apikey, accept",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SELF_URL = "https://api-booking.zailom.com/openapi/live";

Deno.serve((req) => {
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
    // Serialização YAML feita client-side neste runtime: convertemos JSON -> YAML
    // simples via dependência dinâmica. Para manter zero-dep, retornamos JSON e
    // aconselhamos o consumidor a usar o endpoint .json (99% dos casos).
    return new Response(JSON.stringify({ error: "use_json_endpoint", hint: "YAML disponível em booking.zailom.com/openapi.yaml (static)." }), {
      status: 406,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(spec), {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "application/vnd.oai.openapi+json;version=3.1",
      "cache-control": "public, max-age=300",
      "link": `<${SELF_URL}>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
      "x-openapi-version": (spec as any)?.info?.version ?? "unknown",
    },
  });
});
