// Edge function: super-admin-gateway-config
// CRUD de configurações de gateway acessível apenas por super admins.
// Permite que o super admin configure credenciais (Asaas, Stripe, WhatsApp)
// diretamente pelo painel, sem precisar do CLI/Dashboard do Supabase.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSuperAdminError(err: any): boolean {
  const msg = err?.message?.toLowerCase?.() || '';
  return msg.includes('is_super_admin') || msg.includes('does not exist') || msg.includes('não existe');
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const rid = crypto.randomUUID().slice(0, 8);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
      return json({ error: "Configuração do servidor ausente." }, 500);
    }

    // ---- Autenticação ----------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Não autorizado." }, 401);

    const userId = claimsData.claims.sub as string;

    // ---- Valida super admin ----------------------------------------------
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_super_admin", { _uid: userId });
    if (adminErr && isSuperAdminError(adminErr)) {
      console.error(`[GATEWAY_CONFIG][${rid}] is_super_admin error:`, adminErr.message);
      return json({ error: "Função de verificação de super admin não configurada." }, 500);
    }
    if (!isAdmin) return json({ error: "Apenas super admins podem acessar este recurso." }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const method = req.method;

    // ---- GET: listar configs ---------------------------------------------
    if (method === "GET") {
      const { data, error } = await admin
        .from("super_admin_gateway_configs")
        .select("id, provider, key, value, is_secret, description, updated_at, updated_by")
        .order("provider", { ascending: true })
        .order("key", { ascending: true });

      if (error) {
        console.error(`[GATEWAY_CONFIG][${rid}] list error:`, error.message);
        return json({ error: "Erro ao listar configurações." }, 500);
      }

      return json({ ok: true, configs: data ?? [] });
    }

    // ---- POST/PUT: salvar config -----------------------------------------
    if (method === "POST" || method === "PUT") {
      const body = await req.json().catch(() => null);
      const provider = String(body?.provider ?? "").trim().toLowerCase();
      const key = String(body?.key ?? "").trim();
      const value = body?.value === undefined ? undefined : String(body.value);
      const isSecret = body?.is_secret === undefined ? true : Boolean(body.is_secret);
      const description = body?.description === undefined ? undefined : String(body.description);

      if (!provider || !key) {
        return json({ error: "provider e key são obrigatórios." }, 400);
      }

      const upsertData: Record<string, unknown> = {
        provider,
        key,
        value: value ?? null,
        is_secret: isSecret,
        updated_by: userId,
      };
      if (description !== undefined) upsertData.description = description;

      const { data, error } = await admin
        .from("super_admin_gateway_configs")
        .upsert(upsertData, { onConflict: "provider,key" })
        .select()
        .single();

      if (error) {
        console.error(`[GATEWAY_CONFIG][${rid}] upsert error:`, error.message);
        return json({ error: `Erro ao salvar configuração: ${error.message}` }, 500);
      }

      return json({ ok: true, config: data });
    }

    // ---- DELETE: remover config ------------------------------------------
    if (method === "DELETE") {
      const body = await req.json().catch(() => null);
      const id = body?.id;
      const provider = String(body?.provider ?? "").trim().toLowerCase();
      const key = String(body?.key ?? "").trim();

      if (!id && (!provider || !key)) {
        return json({ error: "Informe id ou (provider + key) para remover." }, 400);
      }

      let query = admin.from("super_admin_gateway_configs").delete();
      if (id) query = query.eq("id", id);
      else query = query.eq("provider", provider).eq("key", key);

      const { error } = await query;
      if (error) {
        console.error(`[GATEWAY_CONFIG][${rid}] delete error:`, error.message);
        return json({ error: `Erro ao remover configuração: ${error.message}` }, 500);
      }

      return json({ ok: true });
    }

    return json({ error: "Método não permitido." }, 405);
  } catch (err) {
    console.error(`[GATEWAY_CONFIG][${rid}] erro fatal:`, (err as Error).message);
    return json({ error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
