import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://booking.zailom.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ success: false, error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) return reply({ success: false, error: "Configuração Supabase ausente." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return reply({ success: false, error: "Sessão obrigatória." }, 401);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(authHeader.slice(7));
    if (authError || !authData.user) return reply({ success: false, error: "Sessão inválida." }, 401);

    const { data: superAdmin, error: superAdminError } = await admin
      .from("super_admins").select("*").eq("user_id", authData.user.id).maybeSingle();
    if (superAdminError) return reply({ success: false, error: "Falha ao validar Super Admin.", details: superAdminError.message }, 500);
    if (!superAdmin || (superAdmin.active ?? superAdmin.is_active) === false) {
      return reply({ success: false, error: "Apenas o Super Admin pode recuperar o provisionamento." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id ?? "").trim();
    if (!companyId) return reply({ success: false, error: "company_id é obrigatório." }, 400);

    const { data: company, error: companyError } = await admin.from("companies")
      .select("id, name, slug, owner_name, owner_email, plan_id")
      .eq("id", companyId).maybeSingle();
    if (companyError) return reply({ success: false, error: "Falha ao consultar empresa.", details: companyError.message }, 500);
    if (!company) return reply({ success: false, error: "Empresa não encontrada." }, 404);
    if (!company.owner_email || !company.slug) return reply({ success: false, error: "Empresa sem e-mail do proprietário ou slug interno." }, 409);

    const { data: current, error: integrationError } = await admin.from("chatbot_integration")
      .select("id, talkmap_provisioned, flow_workspace_id")
      .eq("company_id", companyId).maybeSingle();
    if (integrationError) return reply({ success: false, error: "Falha ao consultar integração.", details: integrationError.message }, 500);
    // Mesmo quando já existe workspace, executar a sincronização idempotente
    // para registrar o domínio e migrar o hash bcrypt para a credencial contextual.
    if (!current) {
      const { error: insertError } = await admin.from("chatbot_integration").insert({
        company_id: companyId,
        builder_workspace_slug: company.slug,
        builder_base_url: "https://fwoescubnnagdvwasbjl.supabase.co",
        is_active: false,
        talkmap_provisioned: false,
      });
      if (insertError) return reply({ success: false, error: "Não foi possível preparar o registro de integração.", details: insertError.message }, 500);
    }

    // Não envia senha em texto puro. O provisionador transfere somente o hash bcrypt
    // empresarial do Booking e o Flow o registra sem sobrescrever credenciais existentes.
    const { data: provision, error: provisionError } = await admin.functions.invoke("provision-zailom-flow", {
      body: {
        email: company.owner_email,
        slug: company.slug,
        display_name: company.owner_name || company.name,
        full_name: company.owner_name || company.name,
        plan_id: company.plan_id,
        company_id: company.id,
      },
    });

    if (provisionError || !provision?.success) {
      const reason = provisionError?.message || provision?.error || provision?.details?.error || "O Flow não confirmou o provisionamento.";
      return reply({ success: false, company_id: companyId, error: reason, flow_details: provision?.details ?? null }, 502);
    }

    return reply({
      success: true,
      already_provisioned: Boolean(current?.talkmap_provisioned && current.flow_workspace_id),
      company_id: companyId,
      workspace_id: provision.workspace_id,
      user_id: provision.user_id,
      message: "Workspace Flow vinculado à empresa existente. A senha do proprietário não foi alterada.",
    });
  } catch (error) {
    console.error("[admin-recover-flow-provisioning]", error);
    return reply({ success: false, error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
