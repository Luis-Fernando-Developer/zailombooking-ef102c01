import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── JWT HS256 helper (necessário para o builder-flow-api) ───────────────────
function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signProvisionJwt(secret: string, company_id?: string, email?: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: any = {
    iss: "zailom-booking", 
    aud: "zailom-flow-api",
    purpose: "provision",
    iat: now,
    exp: now + 300, 
  };

  if (company_id) payload.company_id = company_id;
  if (email) payload.email = email;

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
      } 
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const internalProvisionSecret = Deno.env.get("INTERNAL_PROVISION_SECRET") ?? "";
    const embedSharedSecret = Deno.env.get("EMBED_SHARED_SECRET") ?? "";

    console.log("[Provisioning] Iniciando processo...");
    
    // URL da API do Flow Builder (projeto fwoescubnnagdvwasbjl)
    const flowBaseUrl = "https://fwoescubnnagdvwasbjl.supabase.co";

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Validar Autenticação/Origem
    const authHeader = req.headers.get("Authorization");
    let isAuthorized = false;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      if ((internalProvisionSecret !== "" && token === internalProvisionSecret) || 
          (embedSharedSecret !== "" && token === embedSharedSecret)) {
        isAuthorized = true;
      } else {
        try {
          const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
          if (!authError && user) {
            const { data: superAdmin } = await supabaseClient
              .from("super_admins")
              .select("*")
              .eq("user_id", user.id)
              .maybeSingle();

            const isActive = superAdmin?.active ?? superAdmin?.is_active;
            if (superAdmin && isActive !== false) {
              isAuthorized = true;
            }
          }
        } catch (e) {
          console.error("[Provisioning] Erro na validação do token:", e);
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, slug, display_name, company_id, plan_id, full_name } = await req.json();

    let embed_plan_tier = 'starter';
    const planInput = (plan_id || '').toLowerCase();
    
    if (planInput.includes('professional') || planInput.includes('pro') || planInput === '294e3c1b-55ac-49bd-803e-22657a7c8eb7') {
      embed_plan_tier = 'pro';
    } else if (planInput.includes('enterprise') || planInput.includes('business')) {
      embed_plan_tier = 'pro';
    }

    if (!email || !password || !slug || !company_id) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let limits = {
      max_chatbots: 1,
      max_messages: 700,
      max_integrations: 1,
    };

    if (embed_plan_tier === "pro") {
      limits = {
        max_chatbots: 10,
        max_messages: 10000,
        max_integrations: 10,
      };
    }

    console.log(`[Provisioning] Invocado para ${email} (${slug})`);
    
    if (!embedSharedSecret) {
      return new Response(JSON.stringify({ success: false, error: "Configuração incompleta: EMBED_SHARED_SECRET faltando." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provisionToken = await signProvisionJwt(embedSharedSecret, company_id, email);
    const targetUrl = `${flowBaseUrl}/functions/v1/provision-account`;

    const flowPayload = {
      email,
      password,
      full_name: full_name || display_name || slug,
      slug,
      company_id,
      plan_tier: embed_plan_tier,
      limits: {
        max_chatbots: limits.max_chatbots,
        max_messages: limits.max_messages,
        max_integrations: limits.max_integrations,
      }
    };

    console.log(`[Provisioning] Enviando payload para ${targetUrl}`);

    const flowResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provisionToken}`,
      },
      body: JSON.stringify(flowPayload),
    });

    const responseText = await flowResponse.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Resposta inválida do Flow (não é JSON)", 
        status: flowResponse.status,
        details: responseText.substring(0, 200) 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!flowResponse.ok) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: result.error || result.message || "Erro no Flow", 
        details: result 
      }), {
        status: flowResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[Provisioning] Sucesso retornado pelo Flow Builder");

    // Salvar/Atualizar dados da integração no Booking
    const { error: dbError } = await supabaseClient
      .from("chatbot_integration")
      .upsert({
        company_id,
        api_key_prefix: result.api_key?.substring(0, 8),
        builder_workspace_slug: slug,
        builder_base_url: flowBaseUrl,
        is_active: true,
        talkmap_provisioned: true,
        talkmap_provisioned_at: new Date().toISOString(),
        flow_workspace_id: result.workspace_id,
        flow_api_key: result.api_key,
        flow_user_id: result.user_id,
      }, { onConflict: 'company_id' });

    if (dbError) {
      console.error("Erro ao salvar dados de integração:", dbError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      workspace_id: result.workspace_id,
      user_id: result.user_id,
      api_key: result.api_key
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Erro fatal no provisionamento:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});