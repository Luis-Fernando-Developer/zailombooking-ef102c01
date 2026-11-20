import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anonKey || !serviceKey) throw new Error("Configuração do Supabase incompleta.");

    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) throw new Error("Sessão necessária.");

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const token = authorization.slice(7);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Sessão inválida.");

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const companyId = String(body.company_id ?? "");
    if (!email || !companyId) throw new Error("E-mail e empresa são obrigatórios.");

    const scoped = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: allowed, error: permissionError } = await scoped.rpc("user_has_company_permission", {
      _company_id: companyId,
      _permission_code: "employees.create",
    });
    if (permissionError || !allowed) throw new Error("Você não tem permissão para convidar colaboradores nesta empresa.");

    const { data: company, error: companyError } = await admin.from("companies")
      .select("id,name,slug").eq("id", companyId).maybeSingle();
    if (companyError || !company) throw new Error("Empresa não encontrada.");

    const { data: existingId, error: lookupError } = await admin.rpc("get_user_id_by_email", { _email: email });
    if (lookupError) throw lookupError;

    if (existingId) {
      const { data: existing, error } = await admin.auth.admin.getUserById(existingId);
      if (error || !existing.user || (existing.user.email ?? "").toLowerCase() !== email) {
        throw new Error("Não foi possível validar a identidade existente.");
      }
      return json({ success: true, user_id: existingId, existing: true, invitation_sent: false, email_provider: null });
    }

    // Para uma identidade nova, o próprio Supabase Auth envia o convite e cria o perfil global.
    const siteUrl = (Deno.env.get("SITE_URL") || "https://booking.zailom.com").replace(/\/$/, "");
    const redirectTo = `${siteUrl}/${company.slug}/admin/login`;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { name: String(body.name ?? ""), phone: String(body.phone ?? ""), invited_to_company: companyId },
    });
    if (inviteError || !invited.user) {
      throw inviteError ?? new Error("O Supabase não confirmou o envio do convite.");
    }

    return json({
      success: true,
      user_id: invited.user.id,
      existing: false,
      invitation_sent: true,
      email_provider: "supabase",
    });
  } catch (error) {
    console.error("[create-employee-identity] Erro:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno." }, 400);
  }
});
