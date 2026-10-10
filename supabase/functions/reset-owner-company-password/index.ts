import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return reply({ success: false, error: "Serviço indisponível." }, 500);
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    if (!token) return reply({ success: false, error: "O link de recuperação é inválido." }, 400);
    if (password.length < 8) return reply({ success: false, error: "A senha deve ter pelo menos 8 caracteres." }, 400);
    if (new TextEncoder().encode(password).length > 72) return reply({ success: false, error: "A senha deve ter no máximo 72 bytes." }, 400);

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.rpc("reset_owner_company_password", { p_token: token, p_password: password });
    if (error || !data?.success) {
      return reply({ success: false, error: data?.error || "O link expirou ou já foi utilizado. Solicite uma nova recuperação." }, 400);
    }
    return reply({ success: true });
  } catch (error) {
    console.error("[reset-owner-company-password] Erro:", error);
    return reply({ success: false, error: "Não foi possível redefinir a senha. Solicite um novo link." }, 500);
  }
});
