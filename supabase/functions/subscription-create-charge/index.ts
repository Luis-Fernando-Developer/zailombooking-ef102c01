// Edge function: subscription-create-charge
// Gera (ou reaproveita) uma cobrança no Asaas para uma fatura de assinatura
// da plataforma e grava o vínculo asaas_payment_id -> company_invoices.
//
// Segurança:
//  - Exige JWT válido e que o usuário pertença à empresa da fatura.
//  - A chave da plataforma (ASAAS_API_KEY) nunca sai do servidor.

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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" } });

  const rid = crypto.randomUUID().slice(0, 8);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Configuração do servidor ausente." }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const ASAAS_API_KEY = (await getGatewayConfig(admin, "asaas", "ASAAS_API_KEY") ?? "").trim();
    if (!ASAAS_API_KEY) {
      return json({ error: "Gateway da plataforma não configurado (ASAAS_API_KEY)." }, 500);
    }

    // ---- 1) Autenticação -----------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Não autorizado." }, 401);

    const userId = claimsData.claims.sub as string;
    const userEmail = String(claimsData.claims.email ?? "").toLowerCase();

    // ---- 2) Payload ------------------------------------------------------
    const body = await req.json().catch(() => null);
    const invoiceId: string | undefined = body?.invoice_id;
    const billingType: BillingType = (body?.billing_type ?? "PIX") as BillingType;
    // CPF/CNPJ informado pelo painel quando a empresa foi criada sem documento
    // (ex.: cadastro manual pelo super admin). O Asaas exige esse campo.
    const providedDoc = String(body?.cpf_cnpj ?? "").replace(/\D/g, "");

    if (!invoiceId) return json({ error: "invoice_id é obrigatório." }, 400);
    if (!["PIX", "BOLETO", "CREDIT_CARD"].includes(billingType)) {
      return json({ error: "billing_type inválido." }, 400);
    }
    if (providedDoc && ![11, 14].includes(providedDoc.length)) {
      return json({ error: "CPF/CNPJ inválido." }, 400);
    }


    // ---- 3) Carrega fatura + empresa e valida acesso ---------------------
    const { data: invoice, error: invErr } = await admin
      .from("company_invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invErr || !invoice) return json({ error: "Fatura não encontrada." }, 404);
    if (invoice.status === "paid") return json({ error: "Fatura já está paga." }, 400);

    const { data: company } = await admin
      .from("companies")
      .select("id, name, owner_email, owner_name, owner_phone, owner_cpf, cnpj, asaas_customer_id")
      .eq("id", invoice.company_id)
      .maybeSingle();

    if (!company) return json({ error: "Empresa não encontrada." }, 404);

    const isOwner = String(company.owner_email ?? "").toLowerCase() === userEmail;
    let allowed = isOwner;
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

    // ---- 4) Cobrança já existente? ---------------------------------------
    if (invoice.asaas_payment_id && (invoice.invoice_url || invoice.pix_payload)) {
      return json({
        ok: true,
        reused: true,
        invoice_url: invoice.invoice_url,
        bank_slip_url: invoice.bank_slip_url,
        pix_payload: invoice.pix_payload,
        pix_qr_code: invoice.pix_qr_code,
      });
    }

    // ---- 5) Asaas --------------------------------------------------------
    const isSandbox = ASAAS_API_KEY.includes("hmlg") || !ASAAS_API_KEY.startsWith("$aact_");
    const baseUrl = isSandbox
      ? "https://sandbox.asaas.com/api/v3"
      : "https://www.asaas.com/api/v3";
    const headers = {
      access_token: ASAAS_API_KEY,
      "Content-Type": "application/json",
    };

    async function asaas(path: string, init: RequestInit = {}) {
      const r = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const text = await r.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        /* resposta não-JSON */
      }
      if (!r.ok) {
        const msg = data?.errors?.[0]?.description || `Erro Asaas (${r.status})`;
        console.error(`[SUB_CHARGE][${rid}] ${path} -> ${r.status} ${text}`);
        throw new Error(msg);
      }
      return data;
    }

    // 5a) Cliente Asaas (reaproveita se já existe)
    let customerId: string | null = company.asaas_customer_id ?? null;
    const storedDoc = String(company.cnpj || company.owner_cpf || "").replace(/\D/g, "");
    const cpfCnpj = providedDoc || storedDoc;

    // O Asaas recusa criar cliente sem documento. Empresas cadastradas pelo
    // super admin podem não ter CPF/CNPJ — pedimos ao painel nesse caso.
    if (!customerId && !cpfCnpj) {
      return json(
        {
          error: "CPF/CNPJ do responsável é obrigatório para gerar a cobrança.",
          code: "cpf_required",
        },
        400,
      );
    }

    // Persiste o documento informado agora, para não pedir de novo depois.
    if (providedDoc && providedDoc !== storedDoc) {
      const patch = providedDoc.length === 14 ? { cnpj: providedDoc } : { owner_cpf: providedDoc };
      const { error: docErr } = await admin.from("companies").update(patch).eq("id", company.id);
      if (docErr) console.error(`[SUB_CHARGE][${rid}] salvar documento falhou:`, docErr.message);
    }

    if (!customerId) {
      if (cpfCnpj) {
        const found = await asaas(`/customers?cpfCnpj=${cpfCnpj}`, { method: "GET" });
        customerId = found?.data?.[0]?.id ?? null;
      }
      if (!customerId) {
        const createdCustomer = await asaas("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: company.owner_name || company.name,
            email: company.owner_email,
            cpfCnpj: cpfCnpj || undefined,
            mobilePhone: (company.owner_phone ?? "").replace(/\D/g, "") || undefined,
            externalReference: `company:${company.id}`,
          }),
        });
        customerId = createdCustomer?.id ?? null;
      }
      if (customerId) {
        await admin.from("companies").update({ asaas_customer_id: customerId }).eq("id", company.id);
      }
    }


    if (!customerId) return json({ error: "Falha ao criar cliente no Asaas." }, 502);

    // 5b) Cobrança — externalReference identifica a FATURA (e a empresa).
    const dueDate = new Date(invoice.due_date ?? Date.now());
    const dueStr = (dueDate.getTime() < Date.now() ? new Date() : dueDate)
      .toISOString()
      .slice(0, 10);

    const payment = await asaas("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType,
        value: Number(invoice.amount ?? 0),
        dueDate: dueStr,
        description: invoice.description || `Assinatura ZailomBooking - ${company.name}`,
        externalReference: `subscription:${invoice.id}:${company.id}`,
      }),
    });

    // 5c) PIX (quando aplicável)
    let pixPayload: string | null = null;
    let pixQrCode: string | null = null;
    if (billingType === "PIX" && payment?.id) {
      try {
        const pix = await asaas(`/payments/${payment.id}/pixQrCode`, { method: "GET" });
        pixPayload = pix?.payload ?? null;
        pixQrCode = pix?.encodedImage ?? null;
      } catch (e) {
        console.warn(`[SUB_CHARGE][${rid}] pixQrCode falhou:`, (e as Error).message);
      }
    }

    // ---- 6) Persiste o vínculo ------------------------------------------
    const { error: updErr } = await admin
      .from("company_invoices")
      .update({
        asaas_payment_id: payment?.id ?? null,
        asaas_customer_id: customerId,
        billing_type: billingType,
        invoice_url: payment?.invoiceUrl ?? null,
        bank_slip_url: payment?.bankSlipUrl ?? null,
        pix_payload: pixPayload,
        pix_qr_code: pixQrCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (updErr) console.error(`[SUB_CHARGE][${rid}] update invoice erro:`, updErr.message);

    return json({
      ok: true,
      asaas_payment_id: payment?.id ?? null,
      invoice_url: payment?.invoiceUrl ?? null,
      bank_slip_url: payment?.bankSlipUrl ?? null,
      pix_payload: pixPayload,
      pix_qr_code: pixQrCode,
      environment: isSandbox ? "sandbox" : "production",
    });
  } catch (err) {
    console.error(`[SUB_CHARGE][${rid}] erro fatal:`, (err as Error).message);
    return json({ error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
