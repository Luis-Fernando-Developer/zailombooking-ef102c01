import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

serve(async (req) => {
  // CORS handling
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const embedSharedSecret = Deno.env.get("EMBED_SHARED_SECRET") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Validate Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized", details: authError }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "save") {
      const { company_id, api_key } = body;
      if (!company_id || !api_key) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: dbError } = await supabaseClient
        .from("chatbot_integration")
        .upsert({
          company_id,
          api_key_prefix: api_key.substring(0, 8),
          flow_api_key: api_key,
          is_active: true,
          connected_at: new Date().toISOString(),
        }, { onConflict: 'company_id' });

      if (dbError) throw dbError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      const { company_id } = body;
      if (!company_id) {
        return new Response(JSON.stringify({ error: "Missing company_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: dbError } = await supabaseClient
        .from("chatbot_integration")
        .update({
          is_active: false,
          flow_api_key: null,
          api_key_prefix: null,
        })
        .eq("company_id", company_id);

      if (dbError) throw dbError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sign-embed-token") {
      const { company_id, user_id, email, plan, limits } = body;
      if (!company_id || !user_id) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!embedSharedSecret) {
        return new Response(JSON.stringify({ error: "EMBED_SHARED_SECRET not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // NOVO: Buscar o profile do usuário no banco de dados do Zailom Flow
      // para garantir que ele esteja sincronizado antes de gerar o token.
      // Assumimos que o SUPABASE_URL/KEY aqui são do projeto Booking, 
      // mas precisamos atualizar o profile no banco de dados do Zailom Flow se o plano mudou.
      
      // NOTA: Como não temos acesso direto ao DB do Zailom Flow via Edge Function de forma trivial 
      // sem as credenciais dele, o builder deve ler o token e se auto-atualizar.
      // No entanto, o usuário mostrou que o DB do Zailom Flow tem colunas como 'embed_plan_tier'.
      
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: "booking", // Alinhado com embed_source no banco do Flow
        aud: "builder-flow-api",
        purpose: "embed",
        company_id,
        user_id,
        email,
        // Mapeamento direto para as colunas do banco de dados do Zailom Flow
        plan: plan || "starter",
        embed_plan_tier: plan || "starter", 
        embed_company_id: company_id,
        embed_source: "booking",
        embed_max_chatbots: limits?.chatbots ?? 1,
        embed_max_messages: limits?.messages ?? 700,
        embed_max_integrations: limits?.integrations ?? 1,
        embed_plan_synced_at: new Date().toISOString(),
        iat: now,
        exp: now + (3600 * 24),
      };


      const token = await signJwt(payload, embedSharedSecret);

      return new Response(JSON.stringify({ 
        token, 
        builder_base_url: "https://flow-builder.zailom.com" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
