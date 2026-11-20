import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] ?? char));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    if (!url || !anonKey || !serviceKey) throw new Error("Configuração do Supabase incompleta.");
    if (!resendKey) throw new Error("RESEND_API_KEY não está configurada nas Edge Functions.");

    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) throw new Error("Sessão necessária.");
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(authorization.slice(7));
    if (authError || !authData.user) throw new Error("Sessão inválida.");

    const body = await req.json();
    const companyId = String(body.company_id ?? "");
    const employeeId = String(body.employee_id ?? "");
    if (!companyId || !employeeId) throw new Error("Empresa e colaborador são obrigatórios.");

    const scoped = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: allowed, error: permissionError } = await scoped.rpc("user_has_company_permission", {
      _company_id: companyId,
      _permission_code: "employees.create",
    });
    if (permissionError || !allowed) throw new Error("Você não tem permissão para convidar colaboradores nesta empresa.");

    const [{ data: company, error: companyError }, { data: employee, error: employeeError }] = await Promise.all([
      admin.from("companies").select("id,name,slug").eq("id", companyId).maybeSingle(),
      admin.from("employees").select("id,user_id,email,name,company_id").eq("id", employeeId).eq("company_id", companyId).maybeSingle(),
    ]);
    if (companyError || !company) throw new Error("Empresa não encontrada.");
    if (employeeError || !employee) throw new Error("Colaborador não encontrado nesta empresa.");
    const recipient = String(employee.email ?? "").trim().toLowerCase();
    if (!recipient || !employee.user_id) throw new Error("O colaborador ainda não possui uma identidade vinculada.");

    const siteUrl = (Deno.env.get("SITE_URL") || "https://booking.zailom.com").replace(/\/$/, "");
    const loginUrl = `${siteUrl}/${company.slug}/admin/login`;
    const from = (Deno.env.get("EMPLOYEE_INVITE_EMAIL_FROM") || Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
    const name = escapeHtml(employee.name || "colaborador");
    const companyName = escapeHtml(company.name || "sua empresa");
    const safeUrl = escapeHtml(loginUrl);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: `Você foi convidado para acessar ${company.name} | Zailom Booking`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#202124;line-height:1.6">
            <h2>Olá, ${name}!</h2>
            <p>Você foi adicionado como colaborador da empresa <strong>${companyName}</strong> no Zailom Booking.</p>
            <p>Seu acesso nesta empresa já foi configurado. Para entrar, utilize o e-mail que recebeu esta mensagem e a senha empresarial informada pelo administrador.</p>
            <p style="margin:28px 0"><a href="${safeUrl}" style="background:#111827;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;display:inline-block">Acessar minha conta</a></p>
            <p style="font-size:13px;color:#666">Este acesso é específico para ${companyName}. Se você já utiliza o Zailom em outra empresa, sua conta existente continua a mesma.</p>
            <p style="font-size:13px;color:#666">Se não esperava este convite, ignore esta mensagem.</p>
          </div>
        `,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("[send-employee-invitation] Resend error:", detail);
      throw new Error("O convite foi cadastrado, mas o Resend não conseguiu enviar o e-mail.");
    }

    const result = await response.json().catch(() => ({}));
    return json({ success: true, email_sent: true, email_provider: "resend", message_id: result.id ?? null });
  } catch (error) {
    console.error("[send-employee-invitation] Erro:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno." }, 400);
  }
});
