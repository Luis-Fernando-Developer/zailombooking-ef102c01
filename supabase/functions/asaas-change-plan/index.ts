// Edge function: asaas-change-plan
// Troca de plano da assinatura da plataforma.
//   - UPGRADE  -> cobrança imediata com PRORAÇÃO (diferença diária x dias
//                 restantes do ciclo). Se houver cartão tokenizado padrão,
//                 a cobrança é capturada na hora e o plano é aplicado.
//                 Caso contrário, gera PIX e o plano é aplicado pelo webhook.
//   - DOWNGRADE / troca de ciclo -> agendado para o fim do ciclo atual.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGatewayConfig } from "../_shared/gateway-config.ts";

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

const PLAN_LEVELS: Record<string, number> = { starter: 1, professional: 2, enterprise: 3 };
const PERIOD_DAYS: Record<string, number> = { monthly: 30, quarterly: 90, annual: 365 };

function priceOf(plan: any, period: string): number {
  if (period === "annual") return Number(plan?.annual_price ?? 0);
  if (period === "quarterly") return Number(plan?.quarterly_price ?? 0);
  return Number(plan?.monthly_price ?? 0);
}

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
    const newPlanId: string | undefined = body?.new_plan_id;
    const newPeriod: string = String(body?.billing_period ?? "monthly");

    if (!companyId || !newPlanId) return json({ error: "company_id e new_plan_id são obrigatórios." }, 400);
    if (!["monthly", "quarterly", "annual"].includes(newPeriod)) {
      return json({ error: "billing_period inválido." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- Autorização -----------------------------------------------------
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

    // ---- Estado atual ----------------------------------------------------
    const { data: sub } = await admin
      .from("company_subscriptions")
      .select("*, subscription_plans(*)")
      .eq("company_id", company.id)
      .maybeSingle();
    if (!sub) return json({ error: "Assinatura não encontrada." }, 404);

    const { data: newPlan } = await admin
      .from("subscription_plans")
      .select("*")
      .eq("id", newPlanId)
      .maybeSingle();
    if (!newPlan) return json({ error: "Plano de destino não encontrado." }, 404);

    const currentPlan: any = sub.subscription_plans;
    const currentLevel = PLAN_LEVELS[String(currentPlan?.name ?? "").toLowerCase()] ?? 0;
    const newLevel = PLAN_LEVELS[String(newPlan.name ?? "").toLowerCase()] ?? 0;
    const currentPeriod = String(sub.billing_period ?? "monthly");

    if (newPlanId === sub.plan_id && newPeriod === currentPeriod) {
      return json({ error: "Este já é o plano e ciclo atuais." }, 400);
    }

    const now = new Date();
    const nextBilling = sub.next_billing_date
      ? new Date(sub.next_billing_date)
      : new Date(now.getTime() + PERIOD_DAYS[currentPeriod] * 86400000);
    const remainingDays = Math.max(
      0,
      Math.ceil((nextBilling.getTime() - now.getTime()) / 86400000),
    );

    const isUpgrade = newLevel > currentLevel;
    const newPrice = priceOf(newPlan, newPeriod);

    // ---- DOWNGRADE / troca de ciclo: agenda ------------------------------
    if (!isUpgrade) {
      const pending = {
        plan_id: newPlanId,
        billing_period: newPeriod,
        price: newPrice,
        effective_at: nextBilling.toISOString(),
        requested_at: now.toISOString(),
      };
      const { error: updErr } = await admin
        .from("company_subscriptions")
        .update({ pending_plan_change: pending, updated_at: now.toISOString() })
        .eq("id", sub.id);
      if (updErr) return json({ error: `Falha ao agendar: ${updErr.message}` }, 500);

      return json({
        ok: true,
        immediate: false,
        change_type: newLevel < currentLevel ? "plan_downgrade" : "cycle_change",
        next_billing_date: nextBilling.toISOString(),
        proration_amount: 0,
      });
    }

    // ---- UPGRADE: proração imediata --------------------------------------
    const currentDaily = priceOf(currentPlan, currentPeriod) / (PERIOD_DAYS[currentPeriod] || 30);
    const newDaily = newPrice / (PERIOD_DAYS[newPeriod] || 30);
    const prorationRaw = Math.max(0, (newDaily - currentDaily) * remainingDays);
    const prorationAmount = Math.round(prorationRaw * 100) / 100;

    // Diferença desprezível: aplica direto, sem cobrança.
    if (prorationAmount < 1) {
      await admin
        .from("company_subscriptions")
        .update({
          plan_id: newPlanId,
          billing_period: newPeriod,
          original_price: newPrice,
          pending_plan_change: null,
          updated_at: now.toISOString(),
        })
        .eq("id", sub.id);

      return json({
        ok: true,
        immediate: true,
        applied: true,
        proration_amount: 0,
        next_billing_date: nextBilling.toISOString(),
      });
    }

    if (!ASAAS_API_KEY) {
      return json({ error: "Gateway da plataforma não configurado (ASAAS_API_KEY)." }, 500);
    }

    // Fatura interna da proração
    const { data: invoice, error: invErr } = await admin
      .from("company_invoices")
      .insert({
        company_id: company.id,
        amount: prorationAmount,
        status: "pending",
        due_date: now.toISOString().slice(0, 10),
        description: `Upgrade para ${newPlan.name} (proração de ${remainingDays} dia(s))`,
        kind: "plan_change",
        billing_period: newPeriod,
        metadata: {
          new_plan_id: newPlanId,
          billing_period: newPeriod,
          new_price: newPrice,
          remaining_days: remainingDays,
          previous_plan_id: sub.plan_id,
        },
      })
      .select("*")
      .single();

    if (invErr || !invoice) return json({ error: `Falha ao criar fatura: ${invErr?.message}` }, 500);

    // ---- Asaas -----------------------------------------------------------
    const isSandbox = ASAAS_API_KEY.includes("hmlg") || !ASAAS_API_KEY.startsWith("$aact_");
    const baseUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://www.asaas.com/api/v3";
    const headers = { access_token: ASAAS_API_KEY, "Content-Type": "application/json" };

    async function asaas(path: string, init: RequestInit = {}) {
      const r = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const text = await r.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* resposta não-JSON */ }
      if (!r.ok) {
        console.error(`[CHANGE_PLAN][${rid}] ${path} -> ${r.status}`);
        throw new Error(data?.errors?.[0]?.description || `Erro Asaas (${r.status})`);
      }
      return data;
    }

    let customerId: string | null = company.asaas_customer_id ?? null;
    if (!customerId) {
      const cpfCnpj = String(company.cnpj || company.owner_cpf || "").replace(/\D/g, "");
      const created = await asaas("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: company.owner_name || company.name,
          email: company.owner_email,
          cpfCnpj: cpfCnpj || undefined,
          mobilePhone: String(company.owner_phone ?? "").replace(/\D/g, "") || undefined,
          externalReference: `company:${company.id}`,
        }),
      });
      customerId = created?.id ?? null;
      if (customerId) {
        await admin.from("companies").update({ asaas_customer_id: customerId }).eq("id", company.id);
      }
    }
    if (!customerId) return json({ error: "Falha ao criar cliente no Asaas." }, 502);

    // Cartão tokenizado padrão?
    const { data: defaultMethod } = await admin
      .from("company_payment_methods")
      .select("id, type")
      .eq("company_id", company.id)
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle();

    let cardToken: string | null = null;
    if (defaultMethod?.type === "credit_card") {
      const { data: tok } = await admin
        .from("company_payment_tokens")
        .select("asaas_card_token")
        .eq("payment_method_id", defaultMethod.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      cardToken = tok?.asaas_card_token ?? null;
    }

    const externalReference = `subscription:${invoice.id}:${company.id}`;
    const basePayment = {
      customer: customerId,
      value: prorationAmount,
      dueDate: now.toISOString().slice(0, 10),
      description: invoice.description,
      externalReference,
    };

    let payment: any;
    let usedCard = false;

    if (cardToken) {
      try {
        payment = await asaas("/payments", {
          method: "POST",
          body: JSON.stringify({
            ...basePayment,
            billingType: "CREDIT_CARD",
            creditCardToken: cardToken,
            remoteIp: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1",
          }),
        });
        usedCard = true;
      } catch (e) {
        console.warn(`[CHANGE_PLAN][${rid}] cartão recusado, caindo para PIX:`, (e as Error).message);
      }
    }

    let pixPayload: string | null = null;
    let pixQrCode: string | null = null;

    if (!payment) {
      payment = await asaas("/payments", {
        method: "POST",
        body: JSON.stringify({ ...basePayment, billingType: "PIX" }),
      });
      try {
        const pix = await asaas(`/payments/${payment.id}/pixQrCode`, { method: "GET" });
        pixPayload = pix?.payload ?? null;
        pixQrCode = pix?.encodedImage ?? null;
      } catch (e) {
        console.warn(`[CHANGE_PLAN][${rid}] pixQrCode falhou:`, (e as Error).message);
      }
    }

    await admin
      .from("company_invoices")
      .update({
        asaas_payment_id: payment?.id ?? null,
        asaas_customer_id: customerId,
        billing_type: usedCard ? "CREDIT_CARD" : "PIX",
        invoice_url: payment?.invoiceUrl ?? null,
        bank_slip_url: payment?.bankSlipUrl ?? null,
        pix_payload: pixPayload,
        pix_qr_code: pixQrCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    const paidNow = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(
      String(payment?.status ?? ""),
    );

    if (paidNow) {
      await admin.rpc("mark_subscription_invoice_paid", {
        _asaas_payment_id: payment.id,
        _invoice_id: invoice.id,
      });
      await admin.rpc("apply_paid_plan_change", { _invoice_id: invoice.id });
    } else {
      await admin
        .from("company_subscriptions")
        .update({
          pending_plan_change: {
            plan_id: newPlanId,
            billing_period: newPeriod,
            price: newPrice,
            awaiting_invoice_id: invoice.id,
            effective_at: null,
            requested_at: now.toISOString(),
          },
          updated_at: now.toISOString(),
        })
        .eq("id", sub.id);
    }

    return json({
      ok: true,
      immediate: true,
      applied: paidNow,
      change_type: currentPeriod !== newPeriod ? "upgrade_with_cycle_change" : "plan_upgrade",
      proration_amount: prorationAmount,
      remaining_days: remainingDays,
      invoice_id: invoice.id,
      billing_type: usedCard ? "CREDIT_CARD" : "PIX",
      invoice_url: payment?.invoiceUrl ?? null,
      pix_payload: pixPayload,
      pix_qr_code: pixQrCode,
      next_billing_date: nextBilling.toISOString(),
      environment: isSandbox ? "sandbox" : "production",
    });
  } catch (err) {
    console.error(`[CHANGE_PLAN][${rid}] erro fatal:`, (err as Error).message);
    return json({ error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
