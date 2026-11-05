import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return reply({ success: false, error: "Configuração do servidor ausente." }, 500);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    if (!token) return reply({ success: false, error: "Link inválido." }, 400);
    if (password.length < 8) return reply({ success: false, error: "A senha deve ter pelo menos 8 caracteres." }, 400);
    if (new TextEncoder().encode(password).length > 72) return reply({ success: false, error: "A senha deve ter no máximo 72 bytes." }, 400);

    const { data, error } = await admin.rpc("set_owner_company_password", { p_token: token, p_password: password });
    if (error || !data?.success) return reply({ success: false, error: data?.error || error?.message || "Não foi possível ativar a empresa." }, 400);

    const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    let welcomeEmailSent = false;
    if (resendKey && data.email) {
      const from = (Deno.env.get("BILLING_EMAIL_FROM") || Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
      const siteUrl = (Deno.env.get("SITE_URL") || "https://booking.zailom.com").replace(/\/$/, "");
      const loginUrl = siteUrl + "/" + data.company_slug + "/admin/login";
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
        body: JSON.stringify({
          from,
          to: [data.email],
          subject: "Zailom Booking — sua empresa está ativa!",
          html: "<h2>Parabéns, " + (data.company_name || "empreendedor") + "!</h2><p>O pagamento foi confirmado, seu e-mail foi validado e sua senha empresarial foi criada.</p><p>A empresa <strong>" + data.company_name + "</strong> está ativa no Zailom Booking.</p><p><a href=\"" + loginUrl + "\">Acessar meu painel</a></p>",
        }),
      });
      welcomeEmailSent = emailResponse.ok;
      if (!emailResponse.ok) console.error("[set-owner-company-password] Falha no e-mail de boas-vindas:", await emailResponse.text());
    }

    // Provisionar o Flow somente para empresas cuja integração foi habilitada
    // pelo Super Admin. O registro é criado no cadastro e é a fonte explícita
    // dessa opção (não inferir pelo e-mail, pois um usuário pode ter várias empresas).
    let flowProvisioned: boolean | null = null;
    let flowProvisionError: string | null = null;
    const { data: integration, error: integrationLookupError } = await admin.from("chatbot_integration")
      .select("id, talkmap_provisioned, builder_workspace_slug")
      .eq("company_id", data.company_id).maybeSingle();

    if (integrationLookupError) {
      flowProvisionError = integrationLookupError.message;
      console.error("[set-owner-company-password] Falha ao consultar integração Flow:", flowProvisionError);
    } else if (integration && !integration.talkmap_provisioned) {
      const { data: company, error: companyLookupError } = await admin.from("companies")
        .select("plan_id, slug, owner_name, booking_url_type, booking_subdomain, custom_domain, flow_custom_domain_status")
        .eq("id", data.company_id).maybeSingle();

      if (companyLookupError || !company) {
        flowProvisionError = companyLookupError?.message || "Empresa não encontrada para provisionar o Flow.";
      } else {
        try {
          const { data: provisionResult, error: provisionError } = await admin.functions.invoke("provision-zailom-flow", {
            body: {
              email: data.email,
              slug: company.slug || integration.builder_workspace_slug,
              display_name: company.owner_name || data.company_name,
              plan_id: company.plan_id,
              company_id: data.company_id,
            },
          });
          if (provisionError || !provisionResult?.success) {
            flowProvisionError = provisionError?.message || provisionResult?.error || "O Flow não confirmou o provisionamento.";
          } else {
            flowProvisioned = true;
          }
        } catch (e) {
          flowProvisionError = e instanceof Error ? e.message : "Erro inesperado ao provisionar o Flow.";
        }
      }

      if (flowProvisionError) {
        console.error("[set-owner-company-password] Provisionamento Flow não concluído:", flowProvisionError);
      } else if (flowProvisioned && resendKey && data.email) {
        let flowLoginUrl = siteUrl.replace("booking.zailom.com", "flow-builder.zailom.com") + "/login";
        if (company.booking_url_type === "subdomain" && company.booking_subdomain) {
          const subdomain = String(company.booking_subdomain).toLowerCase().replace(/\.zailom\.com$/, "");
          flowLoginUrl = "https://flow-" + subdomain + ".zailom.com/login";
        } else if (company.booking_url_type === "custom_domain" && company.custom_domain) {
          if (company.flow_custom_domain_status === "verified") flowLoginUrl = "https://flow." + String(company.custom_domain).replace(/^https?:\/\//, "").replace(/\/$/, "") + "/login";
        }
        const needsFlowIdentifier = company.booking_url_type === "path" || (company.booking_url_type === "custom_domain" && company.flow_custom_domain_status !== "verified");
        const flowIdentifierHtml = needsFlowIdentifier ? "<p><strong>Identificador da empresa:</strong> " + company.slug + "</p>" : "";
        const flowEmail = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
          body: JSON.stringify({
            from,
            to: [data.email],
            subject: "Zailom Flow — acesso da sua empresa",
            html: "<h2>Seu Zailom Flow está pronto!</h2><p>O ambiente Flow da empresa <strong>" + (data.company_name || "sua empresa") + "</strong> foi provisionado.</p><p><strong>Endereço:</strong> <a href=\"" + flowLoginUrl + "\">" + flowLoginUrl + "</a></p>" + flowIdentifierHtml + "<p><strong>E-mail de acesso:</strong> " + data.email + "</p><p>Use a mesma senha que você acabou de cadastrar no Booking. A partir de agora, as senhas dos dois sistemas poderão ser alteradas separadamente.</p>"
          }),
        });
        if (!flowEmail.ok) console.error("[set-owner-company-password] Falha no e-mail de acesso Flow:", await flowEmail.text());
      }
    } else if (integration?.talkmap_provisioned) {
      flowProvisioned = true;
    }

    return reply({
      success: true,
      company_slug: data.company_slug,
      welcome_email_sent: welcomeEmailSent,
      flow_provisioned: flowProvisioned,
      ...(flowProvisionError ? { flow_provision_error: flowProvisionError } : {}),
    });
  } catch (e) {
    console.error("[set-owner-company-password] Erro:", e);
    return reply({ success: false, error: e instanceof Error ? e.message : "Erro interno." }, 500);
  }
});
