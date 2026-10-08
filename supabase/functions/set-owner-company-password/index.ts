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

    // Se o Super Admin habilitou a integração com o Flow, provisiona somente agora,
    // quando o proprietário definiu a senha contextual. Falha do Flow não desfaz a ativação do Booking.
    const { data: integration } = await admin.from("chatbot_integration")
      .select("id, talkmap_provisioned, builder_workspace_slug")
      .eq("company_id", data.company_id).maybeSingle();
    if (integration && !integration.talkmap_provisioned) {
      const { data: company } = await admin.from("companies").select("plan_id, slug, owner_name").eq("id", data.company_id).maybeSingle();
      try {
        const { data: provisionResult, error: provisionError } = await admin.functions.invoke("provision-zailom-flow", {
          body: {
            email: data.email,
            password,
            slug: company?.slug || integration.builder_workspace_slug,
            display_name: company?.owner_name || data.company_name,
            plan_id: company?.plan_id,
            company_id: data.company_id,
          },
        });
        if (provisionError || !provisionResult?.success) {
          console.error("[set-owner-company-password] Provisionamento Flow não concluído:", provisionError?.message || provisionResult?.error);
        }
      } catch (e) {
        console.error("[set-owner-company-password] Erro ao provisionar Flow:", e);
      }
    }

    return reply({ success: true, company_slug: data.company_slug, welcome_email_sent: welcomeEmailSent });
  } catch (e) {
    console.error("[set-owner-company-password] Erro:", e);
    return reply({ success: false, error: e instanceof Error ? e.message : "Erro interno." }, 500);
  }
});
