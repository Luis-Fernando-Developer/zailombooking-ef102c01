import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const genericResponse = () => reply({
  success: true,
  message: "Se os dados corresponderem a um acesso empresarial, enviaremos as instruções para o e-mail cadastrado.",
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ success: false, error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return reply({ success: false, error: "Serviço indisponível." }, 500);

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const companySlug = String(body.company_slug ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !companySlug) return genericResponse();

    const { data: company } = await admin.from("companies")
      .select("id,name,slug").eq("slug", companySlug).maybeSingle();
    if (!company) return genericResponse();

    const { data: employee } = await admin.from("employees")
      .select("id,email,company_id")
      .eq("company_id", company.id)
      .eq("role", "owner")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (!employee) return genericResponse();

    await admin.from("owner_company_password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("employee_id", employee.id)
      .is("used_at", null);

    const { data: reset, error: insertError } = await admin.from("owner_company_password_resets")
      .insert({ employee_id: employee.id, company_id: company.id, email })
      .select("token")
      .single();
    if (insertError || !reset?.token) {
      console.error("[request-owner-password-reset] Não foi possível criar o token:", insertError?.message);
      return genericResponse();
    }

    const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    if (!resendKey) {
      console.error("[request-owner-password-reset] RESEND_API_KEY não configurada.");
      return genericResponse();
    }

    const site = (Deno.env.get("SITE_URL") || "https://booking.zailom.com").replace(/\/$/, "");
    const resetUrl = site + "/reset-owner-password?token=" + encodeURIComponent(reset.token);
    const from = (Deno.env.get("BILLING_EMAIL_FROM") || Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Zailom Booking — redefinição da senha empresarial",
        html: "<div style=\"font-family:Arial,sans-serif;line-height:1.6\"><h2>Redefinir senha empresarial</h2><p>Recebemos uma solicitação para redefinir a senha da empresa <strong>" +
          String(company.name).replace(/[&<>"]/g, "") +
          "</strong>.</p><p>Este link é válido por 30 minutos e altera somente a senha desta empresa.</p><p><a href=\"" +
          resetUrl +
          "\" style=\"display:inline-block;background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none\">Criar nova senha</a></p><p>Se você não solicitou esta alteração, ignore este e-mail.</p></div>",
      }),
    });
    if (!response.ok) console.error("[request-owner-password-reset] Falha no envio:", await response.text());
    return genericResponse();
  } catch (error) {
    console.error("[request-owner-password-reset] Erro inesperado:", error);
    return genericResponse();
  }
});
