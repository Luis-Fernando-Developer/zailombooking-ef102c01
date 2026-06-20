// Edge Function: generate-release-notes
// Deploy: supabase functions deploy generate-release-notes --no-verify-jwt
// (Validação de JWT é feita em código abaixo; somente super_admin executa.)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ReqBody { features: string[] }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await supabase.auth.getClaims(token);
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("is_super_admin", { _uid: claims.claims.sub });
    if (!isAdmin) return json({ error: "Forbidden — super_admin only" }, 403);

    const body = (await req.json()) as ReqBody;
    if (!Array.isArray(body.features) || body.features.length === 0) {
      return json({ error: "features[] required" }, 400);
    }

    const { data: featureData, error: fErr } = await supabase
      .from("feature_registry")
      .select("id,title,technical_notes,tags,plan_visibility")
      .in("id", body.features);
    if (fErr) return json({ error: fErr.message }, 500);
    if (!featureData?.length) return json({ error: "No features found" }, 404);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const prompt = `Você é um assistente de SaaS. Transforme as features técnicas abaixo numa release note profissional para clientes finais (PT-BR).

Features:
${JSON.stringify(featureData, null, 2)}

Responda APENAS com um JSON válido neste formato:
{
  "title": "string curto e atrativo",
  "summary": "string de 1-2 frases",
  "full_description": "markdown com seções de novidades e benefícios",
  "suggested_plans": ["basic"|"pro"|"master", ...]
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json({ error: "AI error", detail: txt }, aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : 500);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(content); } catch { parsed = { raw: content }; }

    return json({ result: parsed });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
