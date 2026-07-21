import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_FLOW_BASE_URL = "https://api-flowbuilder.zailom.com/functions/v1/flow-api";
const REQUIRED_SCOPES = ["workspace:read", "instances:read", "bots:read"];

// ─── JWT HS256 helper ────────────────────────────────────────────────────────
function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(payload: any, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = new TextEncoder();
  const headerB64 = toBase64Url(enc.encode(JSON.stringify(header)).buffer);
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(payload)).buffer);
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${toBase64Url(sig)}`;
}

// ─── Flow API helper ─────────────────────────────────────────────────────────
async function flowFetch(baseUrl: string, apiKey: string, path: string) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "x-flow-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, body: json };
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const embedSharedSecret = Deno.env.get("EMBED_SHARED_SECRET") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized", details: authError }, 401);

    const body = await req.json();
    const { action } = body;

    // ─── SAVE: valida chave, verifica scopes, cacheia workspace ───────────
    if (action === "save") {
      const { company_id, api_key, base_url } = body;
      if (!company_id || !api_key) return json({ error: "Missing fields" }, 400);

      const flowBase = (base_url && typeof base_url === "string" && base_url.trim()) || DEFAULT_FLOW_BASE_URL;

      // 1. Health check
      const health = await flowFetch(flowBase, api_key, "/v1/health");
      if (!health.ok) {
        return json({
          error: "flow_health_failed",
          message: "Não foi possível validar a chave no Zailom Flow.",
          status: health.status,
          flow_response: health.body,
        }, 400);
      }

      const scopes: string[] = Array.isArray(health.body?.scopes) ? health.body.scopes : [];
      const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
      if (missing.length > 0) {
        return json({
          error: "missing_scopes",
          message: `A chave precisa dos seguintes scopes: ${missing.join(", ")}. Gere uma nova chave no Flow com as permissões corretas.`,
          missing_scopes: missing,
          received_scopes: scopes,
        }, 403);
      }

      // 2. Workspace
      const ws = await flowFetch(flowBase, api_key, "/v1/workspace");
      if (!ws.ok) {
        return json({
          error: "flow_workspace_failed",
          message: "Chave válida, mas não foi possível ler o workspace.",
          status: ws.status,
          flow_response: ws.body,
        }, 400);
      }
      const workspace = ws.body?.data ?? null;

      // 3. Persistir
      const { error: dbError } = await supabaseClient
        .from("chatbot_integration")
        .upsert({
          company_id,
          api_key_prefix: api_key.substring(0, 12),
          flow_api_key: api_key,
          flow_api_base_url: flowBase,
          flow_workspace_data: workspace,
          flow_workspace_id: workspace?.id ?? null,
          flow_scopes: scopes,
          flow_last_synced_at: new Date().toISOString(),
          is_active: true,
          connected_at: new Date().toISOString(),
        }, { onConflict: "company_id" });

      if (dbError) throw dbError;

      return json({ success: true, workspace, scopes });
    }

    // ─── DISCONNECT ───────────────────────────────────────────────────────
    if (action === "disconnect") {
      const { company_id } = body;
      if (!company_id) return json({ error: "Missing company_id" }, 400);
      const { error: dbError } = await supabaseClient
        .from("chatbot_integration")
        .update({
          is_active: false,
          flow_api_key: null,
          api_key_prefix: null,
          flow_workspace_data: null,
          flow_workspace_id: null,
          flow_scopes: [],
          flow_selected_instance_id: null,
          flow_selected_instance_name: null,
          flow_default_bot_id: null,
          flow_default_bot_name: null,
        })
        .eq("company_id", company_id);
      if (dbError) throw dbError;
      return json({ success: true });
    }

    // ─── Helper: carrega integração + valida ativa ────────────────────────
    async function loadIntegration(company_id: string) {
      const { data, error } = await supabaseClient
        .from("chatbot_integration")
        .select("flow_api_key, flow_api_base_url, is_active")
        .eq("company_id", company_id)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.is_active || !data.flow_api_key) {
        return null;
      }
      return {
        apiKey: data.flow_api_key as string,
        baseUrl: (data.flow_api_base_url as string) || DEFAULT_FLOW_BASE_URL,
      };
    }

    // ─── FLOW-FETCH: proxy read-only para endpoints do Flow ───────────────
    // Body: { action:'flow-fetch', company_id, path:'/v1/instances' }
    if (action === "flow-fetch") {
      const { company_id, path } = body;
      if (!company_id || !path || typeof path !== "string" || !path.startsWith("/")) {
        return json({ error: "Missing/invalid company_id or path" }, 400);
      }
      // Whitelist: apenas GETs do escopo esperado
      const allowed = /^\/v1\/(health|workspace|instances(\/[a-f0-9-]+)?|bots(\/[a-f0-9-]+)?(\?.*)?)$/i;
      if (!allowed.test(path)) return json({ error: "Path not allowed" }, 400);

      const integ = await loadIntegration(company_id);
      if (!integ) return json({ error: "not_connected" }, 400);

      const result = await flowFetch(integ.baseUrl, integ.apiKey, path);
      return json(
        result.ok ? { success: true, data: result.body } : {
          error: "flow_error",
          status: result.status,
          flow_response: result.body,
        },
        result.ok ? 200 : result.status,
      );
    }

    // ─── SYNC: re-consulta workspace e atualiza cache ─────────────────────
    if (action === "sync") {
      const { company_id } = body;
      if (!company_id) return json({ error: "Missing company_id" }, 400);
      const integ = await loadIntegration(company_id);
      if (!integ) return json({ error: "not_connected" }, 400);

      const [health, ws] = await Promise.all([
        flowFetch(integ.baseUrl, integ.apiKey, "/v1/health"),
        flowFetch(integ.baseUrl, integ.apiKey, "/v1/workspace"),
      ]);

      if (!health.ok) {
        return json({ error: "flow_health_failed", flow_response: health.body }, health.status);
      }
      const scopes: string[] = Array.isArray(health.body?.scopes) ? health.body.scopes : [];
      const workspace = ws.ok ? ws.body?.data ?? null : null;

      await supabaseClient
        .from("chatbot_integration")
        .update({
          flow_workspace_data: workspace,
          flow_workspace_id: workspace?.id ?? null,
          flow_scopes: scopes,
          flow_last_synced_at: new Date().toISOString(),
        })
        .eq("company_id", company_id);

      return json({ success: true, workspace, scopes });
    }

    // ─── SAVE-CONFIG: persiste instância + bot padrão selecionados ────────
    if (action === "save-config") {
      const {
        company_id,
        instance_id, instance_name,
        default_bot_id, default_bot_name,
        event_bots,
      } = body;
      if (!company_id) return json({ error: "Missing company_id" }, 400);

      const patch: Record<string, unknown> = {};
      if (instance_id !== undefined)      patch.flow_selected_instance_id   = instance_id;
      if (instance_name !== undefined)    patch.flow_selected_instance_name = instance_name;
      if (default_bot_id !== undefined)   patch.flow_default_bot_id   = default_bot_id;
      if (default_bot_name !== undefined) patch.flow_default_bot_name = default_bot_name;
      if (event_bots !== undefined && event_bots && typeof event_bots === "object") {
        patch.flow_event_bots = event_bots;
      }

      if (Object.keys(patch).length === 0) return json({ error: "no fields to update" }, 400);

      const { error: dbError } = await supabaseClient
        .from("chatbot_integration")
        .update(patch)
        .eq("company_id", company_id);
      if (dbError) throw dbError;
      return json({ success: true });
    }

    // ─── SIGN EMBED TOKEN (legado / provisionamento) ──────────────────────
    if (action === "sign-embed-token") {
      const { company_id, user_id, email, plan, limits } = body;
      if (!company_id || !user_id) return json({ error: "Missing fields" }, 400);
      if (!embedSharedSecret) return json({ error: "EMBED_SHARED_SECRET not configured" }, 500);

      const { data: company } = await supabaseClient
        .from("companies").select("slug, name").eq("id", company_id).maybeSingle();
      const slug = company?.slug || company_id;

      let tier = "starter";
      if (plan === "professional" || plan === "pro") tier = "pro";
      else if (plan === "enterprise" || plan === "business") tier = "business";

      const currentLimits = {
        max_chatbots: limits?.chatbots ?? (tier === "business" ? 100 : tier === "pro" ? 3 : 1),
        max_messages: limits?.messages ?? (tier === "business" ? 1000000 : tier === "pro" ? 5000 : 700),
        max_integrations: limits?.integrations ?? (tier === "business" ? 100 : tier === "pro" ? 3 : 1),
      };
      const now = Math.floor(Date.now() / 1000);
      const token = await signJwt({
        iss: "zailom-booking", aud: "zailom-flow-api", sub: email, user_email: email,
        company_id, workspace_slug: slug, exp: now + 3600 * 24,
        plan_tier: tier, metadata: currentLimits, iat: now,
      }, embedSharedSecret);
      return json({ token, builder_base_url: "https://flow-builder.zailom.com", sync_required: false });
    }

    // ─── SYNC PLAN (legado) ───────────────────────────────────────────────
    if (action === "sync-plan") {
      const { company_id, plan, limits } = body;
      if (!company_id) return json({ error: "Missing company_id" }, 400);
      if (!embedSharedSecret) return json({ error: "EMBED_SHARED_SECRET not configured" }, 500);
      let tier = "starter";
      const p = (plan || "").toLowerCase();
      if (p.includes("professional") || p.includes("pro")) tier = "pro";
      else if (p.includes("enterprise") || p.includes("business")) tier = "business";
      const syncLimits = {
        max_chatbots: limits?.chatbots ?? (tier === "business" ? 100 : tier === "pro" ? 3 : 1),
        max_messages: limits?.messages ?? (tier === "business" ? 1000000 : tier === "pro" ? 5000 : 700),
        max_integrations: limits?.integrations ?? (tier === "business" ? 100 : tier === "pro" ? 3 : 1),
      };
      const now = Math.floor(Date.now() / 1000);
      const token = await signJwt({ iss: "zailom-booking", iat: now, exp: now + 3600 }, embedSharedSecret);
      const targetUrl = "https://fwoescubnnagdvwasbjl.supabase.co/functions/v1/sync-embed-plan";
      const flowResponse = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ company_id, source: "booking", tier, limits: syncLimits }),
      });
      const result = await flowResponse.json();
      return json({ success: flowResponse.ok, result }, flowResponse.status);
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("Error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
