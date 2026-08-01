// Edge function: asaas-set-payment-method
// Define o método de pagamento padrão da assinatura da empresa.
//  - type = "pix" | "boleto": apenas registra a preferência.
//  - type = "credit_card": TOKENIZA o cartão no Asaas. O PAN/CCV nunca é
//    persistido; guardamos somente o token (tabela isolada, service_role)
//    e bandeira/últimos dígitos para exibição.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ---------------------------------------------------------------------------
// Inlined de _shared/gateway-config.ts — o editor do painel Supabase não
// resolve imports relativos fora da pasta da própria função.
// Ordem: variável de ambiente -> tabela public.super_admin_gateway_configs.
// ---------------------------------------------------------------------------
async function getGatewayConfig(
  adminClient: any,
  provider: string,
  key: string,
): Promise<string | undefined> {
  const envValue = (Deno.env.get(key) ?? '').trim();
  if (envValue) return envValue;

  const { data, error } = await adminClient
    .from('super_admin_gateway_configs')
    .select('value')
    .eq('provider', provider)
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`[gateway-config] erro ao ler ${provider}/${key}:`, error.message);
    return undefined;
  }
  return data?.value?.trim() || undefined;
}

async function getGatewayConfigFirst(
  adminClient: any,
  provider: string,
  keys: string[],
): Promise<string | undefined> {
  for (const key of keys) {
    const value = await getGatewayConfig(adminClient, provider, key);
    if (value) return value;
  }
  return undefined;
}

async function getEvolutionBaseUrl(adminClient: any): Promise<string | undefined> {
  const value = await getGatewayConfigFirst(adminClient, 'whatsapp', [
    'EVOLUTION_GLOBAL_BASE_URL',
    'EVOLUTION_GLOBAL_URL',
    'EVOLUTION_MANAGER_URL',
  ]);
  return value?.replace(/\/$/, '');
}

async function getEvolutionApiKey(adminClient: any): Promise<string | undefined> {
  return getGatewayConfigFirst(adminClient, 'whatsapp', [
    'EVOLUTION_GLOBAL_API_KEY',
    'EVOLUTION_MANAGER_KEY',
  ]);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const rid = crypto.randomUUID().slice(0, 8);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Configuração do servidor ausente." }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const ASAAS_API_KEY = (await getGatewayConfig(admin, "asaas", "ASAAS_API_KEY") ?? "").trim();

    // ---- Autenticação ----------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsData?.claims) return json({ error: "Não autorizado." }, 401);

    const userId = claimsData.claims.sub as string;
    const userEmail = String(claimsData.claims.email ?? "").toLowerCase();

    // ---- Payload ---------------------------------------------------------
    const body = await req.json().catch(() => null);
    const companyId: string | undefined = body?.company_id;
    const type: string = String(body?.type ?? "");

    if (!companyId) return json({ error: "company_id é obrigatório." }, 400);
    if (!["pix", "boleto", "credit_card"].includes(type)) {
      return json({ error: "type inválido (pix | boleto | credit_card)." }, 400);
    }

    // ---- Autorização na empresa -----------------------------------------
    const { data: company } = await admin
      .from("companies")
      .select("id, name, owner_email, owner_name, owner_phone, owner_cpf, cnpj, asaas_customer_id")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) return json({ error: "Empresa não encontrada." }, 404);

    let allowed = String(company.owner_email ?? "").toLowerCase() === userEmail;
    if (!allowed) {
      const { data: emp } = await admin
        .from("employees")
        .select("id, role")
        .eq("company_id", company.id)
        .eq("user_id", userId)
        .maybeSingle();
      allowed = !!emp && ["owner", "admin", "manager"].includes(String(emp.role ?? ""));
    }
    if (!allowed) return json({ error: "Sem permissão para esta empresa." }, 403);

    async function setAsDefault(methodId: string) {
      await admin
        .from("company_payment_methods")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("company_id", company!.id)
        .neq("id", methodId);
      await admin
        .from("company_payment_methods")
        .update({ is_default: true, is_active: true, updated_at: new Date().toISOString() })
        .eq("id", methodId);
      await admin
        .from("company_subscriptions")
        .update({ current_payment_method_id: methodId, updated_at: new Date().toISOString() })
        .eq("company_id", company!.id);
    }

    // ---- PIX / BOLETO ----------------------------------------------------
    if (type === "pix" || type === "boleto") {
      const label = type === "pix" ? "PIX" : "Boleto bancário";

      const { data: existing } = await admin
        .from("company_payment_methods")
        .select("id")
        .eq("company_id", company.id)
        .eq("type", type)
        .is("deleted_at", null)
        .maybeSingle();

      let methodId = existing?.id as string | undefined;
      if (!methodId) {
        // libera o índice único de "um padrão por empresa" antes de inserir
        await admin
          .from("company_payment_methods")
          .update({ is_default: false })
          .eq("company_id", company.id);

        const { data: created, error: insErr } = await admin
          .from("company_payment_methods")
          .insert({
            company_id: company.id,
            type,
            display_label: label,
            is_default: true,
            is_active: true,
          })
          .select("id")
          .single();
        if (insErr) return json({ error: `Falha ao salvar método: ${insErr.message}` }, 500);
        methodId = created.id;
      }

      await setAsDefault(methodId!);
      return json({ ok: true, payment_method_id: methodId, type });
    }

    // ---- CARTÃO DE CRÉDITO (tokenização) ---------------------------------
    if (!ASAAS_API_KEY) {
      return json({ error: "Gateway da plataforma não configurado (ASAAS_API_KEY)." }, 500);
    }

    const cc = body?.credit_card ?? {};
    const holder = body?.credit_card_holder_info ?? {};

    const number = onlyDigits(cc.number);
    const ccv = onlyDigits(cc.ccv);
    const expiryMonth = onlyDigits(cc.expiryMonth);
    const expiryYear = onlyDigits(cc.expiryYear);
    const holderName = String(cc.holderName ?? "").trim();

    const errors: string[] = [];
    if (holderName.length < 3) errors.push("Nome do titular inválido.");
    if (number.length < 13 || number.length > 19) errors.push("Número do cartão inválido.");
    if (ccv.length < 3 || ccv.length > 4) errors.push("CCV inválido.");
    if (expiryMonth.length !== 2 || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) {
      errors.push("Mês de validade inválido.");
    }
    if (![2, 4].includes(expiryYear.length)) errors.push("Ano de validade inválido.");
    if (onlyDigits(holder.cpfCnpj).length < 11) errors.push("CPF/CNPJ do titular inválido.");
    if (onlyDigits(holder.postalCode).length !== 8) errors.push("CEP do titular inválido.");
    if (!String(holder.addressNumber ?? "").trim()) errors.push("Número do endereço é obrigatório.");
    if (!String(holder.email ?? company.owner_email ?? "").includes("@")) errors.push("E-mail inválido.");
    if (errors.length) return json({ error: errors.join(" ") }, 400);

    const isSandbox = ASAAS_API_KEY.includes("hmlg") || !ASAAS_API_KEY.startsWith("$aact_");
    const baseUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://www.asaas.com/api/v3";
    const headers = { access_token: ASAAS_API_KEY, "Content-Type": "application/json" };

    async function asaas(path: string, init: RequestInit = {}) {
      const r = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const text = await r.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* resposta não-JSON */ }
      if (!r.ok) {
        console.error(`[SET_PM][${rid}] ${path} -> ${r.status}`);
        throw new Error(data?.errors?.[0]?.description || `Erro Asaas (${r.status})`);
      }
      return data;
    }

    // Cliente Asaas (reaproveita ou cria)
    let customerId: string | null = company.asaas_customer_id ?? null;
    const cpfCnpj = onlyDigits(company.cnpj || company.owner_cpf || holder.cpfCnpj);
    if (!customerId) {
      if (cpfCnpj) {
        const found = await asaas(`/customers?cpfCnpj=${cpfCnpj}`, { method: "GET" });
        customerId = found?.data?.[0]?.id ?? null;
      }
      if (!customerId) {
        const created = await asaas("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: company.owner_name || company.name,
            email: company.owner_email,
            cpfCnpj: cpfCnpj || undefined,
            mobilePhone: onlyDigits(company.owner_phone) || undefined,
            externalReference: `company:${company.id}`,
          }),
        });
        customerId = created?.id ?? null;
      }
      if (customerId) {
        await admin.from("companies").update({ asaas_customer_id: customerId }).eq("id", company.id);
      }
    }
    if (!customerId) return json({ error: "Falha ao criar cliente no Asaas." }, 502);

    const remoteIp =
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";

    const tokenized = await asaas("/creditCard/tokenize", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        creditCard: {
          holderName,
          number,
          expiryMonth,
          expiryYear: expiryYear.length === 2 ? `20${expiryYear}` : expiryYear,
          ccv,
        },
        creditCardHolderInfo: {
          name: String(holder.name ?? holderName),
          email: String(holder.email ?? company.owner_email),
          cpfCnpj: onlyDigits(holder.cpfCnpj),
          postalCode: onlyDigits(holder.postalCode),
          addressNumber: String(holder.addressNumber),
          phone: onlyDigits(holder.phone ?? company.owner_phone) || undefined,
        },
        remoteIp,
      }),
    });

    const cardToken: string | null = tokenized?.creditCardToken ?? null;
    if (!cardToken) return json({ error: "Não foi possível tokenizar o cartão." }, 502);

    const brand = tokenized?.creditCardBrand ?? null;
    const last4 = tokenized?.creditCardNumber ?? number.slice(-4);

    // libera o índice único de padrão
    await admin
      .from("company_payment_methods")
      .update({ is_default: false })
      .eq("company_id", company.id);

    const { data: method, error: mErr } = await admin
      .from("company_payment_methods")
      .insert({
        company_id: company.id,
        type: "credit_card",
        brand,
        last_digits: last4,
        holder_name: holderName,
        expiry_month: expiryMonth,
        expiry_year: expiryYear,
        display_label: `${brand ?? "Cartão"} •••• ${last4}`,
        is_default: true,
        is_active: true,
      })
      .select("id")
      .single();

    if (mErr) return json({ error: `Falha ao salvar cartão: ${mErr.message}` }, 500);

    const { error: tErr } = await admin.from("company_payment_tokens").insert({
      company_id: company.id,
      payment_method_id: method.id,
      asaas_customer_id: customerId,
      asaas_card_token: cardToken,
    });
    if (tErr) console.error(`[SET_PM][${rid}] falha ao guardar token:`, tErr.message);

    await setAsDefault(method.id);

    return json({
      ok: true,
      payment_method_id: method.id,
      brand,
      last_digits: last4,
      environment: isSandbox ? "sandbox" : "production",
    });
  } catch (err) {
    console.error(`[SET_PM][${rid}] erro fatal:`, (err as Error).message);
    return json({ error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
