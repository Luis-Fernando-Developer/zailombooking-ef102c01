import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const flowBaseUrl = "https://flow-builder.zailom.com";

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Validar Autenticação/Origem
    const authHeader = req.headers.get("Authorization");
    let isAuthorized = false;
    let authMethod = "";

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      // Verificar se é a chave de provisionamento interno
      if (internalProvisionSecret !== "" && token === internalProvisionSecret) {
        isAuthorized = true;
        authMethod = "internal_secret";
        console.log("[Provisioning] Autorizado via INTERNAL_PROVISION_SECRET (global)");
      } else {
        // Verificar se é um JWT de usuário (SuperAdmin)
        try {
          const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
          
          if (!authError && user) {
            // Consultar a tabela super_admins para validar permissão
            const { data: superAdmin, error: dbError } = await supabaseClient
              .from("super_admins")
              .select("id, active")
              .eq("user_id", user.id)
              .maybeSingle();

            if (!dbError && superAdmin?.active) {
              isAuthorized = true;
              authMethod = "super_admin_jwt";
              console.log(`[Provisioning] Autorizado via SuperAdmin: ${user.email}`);
            } else {
              console.error(`[Provisioning] Falha na autorização: active=${superAdmin?.active}, dbError=${dbError?.message}`);
            }
          } else if (authError) {
            console.error("[Provisioning] Erro ao validar JWT:", authError.message);
          }
        } catch (e) {
          console.error("[Provisioning] Erro inesperado na validação do token:", e);
        }
      }
    }

    if (!isAuthorized) {
      console.error("[Provisioning] Acesso NEGADO.");
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, slug, display_name, company_id, plan_id } = await req.json();

    if (!email || !password || !slug || !company_id) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Definir limites baseados no plano (O Flow apenas obedece)
    let limits = {
      max_chatbots: 1,
      max_messages: 700,
      max_integrations: 1,
    };

    if (plan_id === "professional") {
      limits = {
        max_chatbots: 3,
        max_messages: 5000,
        max_integrations: 3,
      };
    } else if (plan_id === "enterprise") {
      limits = {
        max_chatbots: 999999,
        max_messages: 999999,
        max_integrations: 999999,
      };
    }

    console.log(`[Provisioning][${authMethod}] Invocado para ${email} (${slug}) plano: ${plan_id}`);
    console.log(`[Provisioning] Chamando Flow em: ${flowBaseUrl}/functions/v1/provision-account`);

    const flowResponse = await fetch(`${flowBaseUrl}/functions/v1/provision-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${embedSharedSecret}`,
      },
      body: JSON.stringify({
        email,
        password,
        slug,
        display_name,
        company_id,
        embed_source: "booking",
        embed_plan_tier: plan_id,
        limits,
      }),
    });

    console.log(`[Provisioning] Resposta do Flow: ${flowResponse.status}`);
    const result = await flowResponse.json();

    if (!flowResponse.ok || !result.success) {
      console.error("Erro no provisionamento do Zailom Flow:", result);
      return new Response(JSON.stringify({ success: false, error: result.error || "Erro no Flow", details: result }), {
        status: flowResponse.status === 200 ? 500 : flowResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Salvar dados da integração no Booking
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
      user_id: result.user_id 
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

