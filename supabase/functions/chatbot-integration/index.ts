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
      const { company_id, user_id, email, plan, plan_id, limits, force_sync } = body;
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

      // 1. Buscar slug da empresa para sincronização
      const { data: company } = await supabaseClient
        .from("companies")
        .select("slug, name")
        .eq("id", company_id)
        .maybeSingle();

      const slug = company?.slug || company_id;
      const displayName = company?.name || email.split('@')[0];

      // 2. Mapear tier para o builder (free, starter, pro)
      // O builder espera 'pro' para Professional e 'business' (ou pro) para Enterprise
      const tier = plan === "pro" || plan === "professional" || plan === "business" || plan === "enterprise" ? "pro" : "starter";

      const currentLimits = {
        max_chatbots: limits?.chatbots ?? (tier === 'pro' ? 10 : 1),
        max_messages: limits?.messages ?? (tier === 'pro' ? 10000 : 700),
        max_integrations: limits?.integrations ?? (tier === 'pro' ? 10 : 1),
      };

      // 3. Sincronizar o plano no banco de dados do Builder via API de Sincronização
      // Isso é CRUCIAL: o builder UI consulta o banco de dados dele para limites.
      // 3. Sincronizar o plano no banco de dados do Builder via função local de provisionamento
      // Isso centraliza a lógica e garante que os logs apareçam na função correta.
      try {
        console.log(`[Provision] Iniciando sincronização local para ${email}...`);
        
        const provisionPayload = {
          email: email,
          password: "InitialPassword123!", // Senha temporária caso o usuário não exista
          slug: slug,
          display_name: displayName,
          company_id: company_id,
          plan_id: plan_id || tier,
          full_name: displayName
        };

        const localProvisionUrl = `${supabaseUrl}/functions/v1/provision-zailom-flow`;
        
        const syncRes = await fetch(localProvisionUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${embedSharedSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(provisionPayload),
        });

        const syncData = await syncRes.json();
        
        if (!syncRes.ok) {
          console.error(`[Provision] Falha na função local de provisionamento (${syncRes.status}):`, syncData);
          // Se falhar, ainda prosseguimos com a geração do JWT para não bloquear o acesso ao frontend
        } else {
          console.log(`[Provision] Sincronização local concluída com sucesso.`, syncData);
        }
      } catch (syncErr) {
        console.error(`[Provision] Erro ao tentar chamar provisionamento local:`, syncErr);
      }
      
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: "zailom-booking",
        aud: "zailom-flow-api",
        sub: email,
        user_email: email, // Adicionado conforme especificação técnica
        company_id,
        workspace_slug: slug,
        exp: now + (3600 * 24),
        plan_tier: tier,
        metadata: currentLimits,
        iat: now,
      };

      const token = await signJwt(payload, embedSharedSecret);

      return new Response(JSON.stringify({ 
        token, 
        builder_base_url: "https://flow-builder.zailom.com",
        sync_required: true 
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