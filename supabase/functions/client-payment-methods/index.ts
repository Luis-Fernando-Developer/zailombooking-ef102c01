import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function fingerprint(provider: string, key: string) {
  const bytes = new TextEncoder().encode(`${provider}:${key.trim()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request) {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
}

async function asaasRequest(url: string, key: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "ZailomBooking/1.0", ...(init.headers || {}) },
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.description || payload?.message;
    throw new Error(detail ? String(detail) : `O Asaas recusou a operação (${response.status}).`);
  }
  return payload;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Faça login para gerenciar seus cartões." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !auth.user) return json({ error: "Sessão inválida ou expirada." }, 401);

    const body = await req.json();
    const action = String(body?.action || "");
    const companyId = String(body?.company_id || "");
    if (!companyId) return json({ error: "Empresa não informada." }, 400);

    const { data: client, error: clientError } = await supabase
      .from("clients").select("id,name,email,phone,cpf,user_id,company_id")
      .eq("company_id", companyId).eq("user_id", auth.user.id).maybeSingle();
    if (clientError || !client) return json({ error: "Perfil de cliente não encontrado nesta empresa." }, 403);

    const { data: settings, error: settingsError } = await supabase
      .from("company_payment_settings").select("own_gateway_provider,own_gateway_api_key_encrypted")
      .eq("company_id", companyId).maybeSingle();
    if (settingsError || !settings) return json({ error: "Configuração de recebimento não encontrada." }, 404);

    const provider = String(settings.own_gateway_provider || "asaas").toLowerCase();
    const key = String(settings.own_gateway_api_key_encrypted || "").trim();
    if (!key) return json({ error: "A empresa ainda não configurou a chave do gateway." }, 409);
    const accountFingerprint = await fingerprint(provider, key);
    const scope = { company_id: companyId, client_id: client.id, provider, gateway_account_fingerprint: accountFingerprint };

    if (action === "list-cards") {
      const { data: cards, error } = await supabase.from("client_saved_payment_methods")
        .select("id,provider,card_brand,card_last4,expiry_month,expiry_year,is_default,created_at")
        .match(scope).order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ cards: cards || [], provider });
    }

    if (action === "save-card") {
      if (provider !== "asaas") return json({ error: "O cadastro de cartão salvo está habilitado somente para o Asaas nesta versão." }, 409);
      const methodData = body?.method_data || {};
      const creditCard = methodData.creditCard || {};
      const holder = methodData.creditCardHolderInfo || {};
      const number = String(creditCard.number || "").replace(/\D/g, "");
      const ccv = String(creditCard.ccv || "").replace(/\D/g, "");
      const month = String(creditCard.expiryMonth || "");
      const year = String(creditCard.expiryYear || "");
      const holderName = String(creditCard.holderName || "").trim();
      if (number.length < 13 || number.length > 19 || !/^\d{3,4}$/.test(ccv) || !/^\d{2}$/.test(month) || !/^\d{4}$/.test(year) || !holderName) {
        return json({ error: "Os dados do cartão são inválidos." }, 400);
      }
      if (!holder.name || !holder.email || !holder.cpfCnpj || !holder.postalCode || !holder.addressNumber) {
        return json({ error: "Preencha todos os dados obrigatórios do titular." }, 400);
      }
      const remoteIp = clientIp(req);
      if (!remoteIp) return json({ error: "Não foi possível identificar o IP do dispositivo para validar o cartão. Tente novamente." }, 400);

      const baseUrl = key.includes("hmlg") || !key.startsWith("$aact_")
        ? "https://sandbox.asaas.com/api/v3"
        : "https://www.asaas.com/api/v3";
      const customerParams = new URLSearchParams();
      const cpfCnpj = String(holder.cpfCnpj).replace(/\D/g, "");
      if (cpfCnpj) customerParams.set("cpfCnpj", cpfCnpj);
      else if (holder.email) customerParams.set("email", String(holder.email));
      const customers = await asaasRequest(`${baseUrl}/customers?${customerParams}`, key);
      let customerId = customers.data?.[0]?.id;
      if (!customerId) {
        const customer = await asaasRequest(`${baseUrl}/customers`, key, {
          method: "POST",
          body: JSON.stringify({
            name: String(holder.name).trim(), email: String(holder.email).trim(),
            cpfCnpj, phone: String(holder.phone || "").replace(/\D/g, "") || undefined,
            mobilePhone: String(holder.mobilePhone || "").replace(/\D/g, "") || undefined,
          }),
        });
        customerId = customer.id;
      }
      if (!customerId) throw new Error("Não foi possível identificar o cliente no Asaas.");

      // Dados completos do cartão existem apenas durante esta chamada; nunca são gravados nem logados.
      const tokenized = await asaasRequest(`${baseUrl}/creditCard/tokenizeCreditCard`, key, {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          creditCard: { holderName, number, expiryMonth: month, expiryYear: year, ccv },
          creditCardHolderInfo: {
            name: String(holder.name).trim(), email: String(holder.email).trim(), cpfCnpj,
            postalCode: String(holder.postalCode).replace(/\D/g, ""),
            addressNumber: String(holder.addressNumber).trim(),
            phone: String(holder.phone || "").replace(/\D/g, "") || undefined,
            mobilePhone: String(holder.mobilePhone || "").replace(/\D/g, "") || undefined,
          },
          remoteIp,
        }),
      });
      const providerToken = String(tokenized.creditCardToken || "");
      const last4 = String(tokenized.creditCardNumber || "").replace(/\D/g, "").slice(-4);
      if (!providerToken || !/^\d{4}$/.test(last4)) throw new Error("O Asaas não retornou o token e os últimos dígitos do cartão.");

      // O cartão adicionado mais recentemente passa a ser o padrão.
      const makeDefault = true;
      const { error: clearDefaultError } = await supabase.from("client_saved_payment_methods")
        .update({ is_default: false }).match(scope).eq("is_default", true);
      if (clearDefaultError) throw clearDefaultError;
      const { data: saved, error: saveError } = await supabase.from("client_saved_payment_methods").insert({
        ...scope, gateway_customer_id: customerId, provider_token: providerToken,
        card_brand: tokenized.creditCardBrand || null, card_last4: last4,
        expiry_month: Number(month), expiry_year: Number(year), is_default: makeDefault,
      }).select("id,provider,card_brand,card_last4,expiry_month,expiry_year,is_default,created_at").single();
      if (saveError) throw saveError;
      return json({ card: saved });
    }

    if (action === "set-default" || action === "delete-card") {
      const cardId = String(body?.card_id || "");
      if (!cardId) return json({ error: "Cartão não informado." }, 400);
      const { data: target, error: targetError } = await supabase.from("client_saved_payment_methods")
        .select("id,is_default").match(scope).eq("id", cardId).maybeSingle();
      if (targetError || !target) return json({ error: "Cartão não encontrado nesta carteira." }, 404);

      if (action === "set-default") {
        const { error: clearError } = await supabase.from("client_saved_payment_methods").update({ is_default: false }).match(scope).eq("is_default", true);
        if (clearError) throw clearError;
        const { error: defaultError } = await supabase.from("client_saved_payment_methods").update({ is_default: true, updated_at: new Date().toISOString() }).match(scope).eq("id", cardId);
        if (defaultError) throw defaultError;
        return json({ success: true });
      }

      const { error: deleteError } = await supabase.from("client_saved_payment_methods").delete().match(scope).eq("id", cardId);
      if (deleteError) throw deleteError;
      if (target.is_default) {
        const { data: nextCard } = await supabase.from("client_saved_payment_methods").select("id").match(scope).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (nextCard?.id) await supabase.from("client_saved_payment_methods").update({ is_default: true }).match(scope).eq("id", nextCard.id);
      }
      return json({ success: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error: any) {
    // Nunca registrar request body: ele pode conter PAN/CVV durante a tokenização.
    console.error("[client-payment-methods]", error?.message || "unknown_error");
    return json({ error: error?.message || "Não foi possível gerenciar os cartões." }, 400);
  }
});
