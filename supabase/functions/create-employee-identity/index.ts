import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) throw new Error("Sessão necessária.");

    const admin = createClient(url, serviceKey);
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

    const { data: existingId, error: lookupError } = await admin.rpc("get_user_id_by_email", { _email: email });
    if (lookupError) throw lookupError;
    if (existingId) {
      const { data: existing, error } = await admin.auth.admin.getUserById(existingId);
      if (error || !existing.user || (existing.user.email ?? "").toLowerCase() !== email) {
        throw new Error("Não foi possível validar a identidade existente.");
      }
      return new Response(JSON.stringify({ success: true, user_id: existingId, existing: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: String(body.name ?? ""), phone: String(body.phone ?? "") },
    });
    if (createError || !created.user) throw createError ?? new Error("Não foi possível criar a identidade global.");
    return new Response(JSON.stringify({ success: true, user_id: created.user.id, existing: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
