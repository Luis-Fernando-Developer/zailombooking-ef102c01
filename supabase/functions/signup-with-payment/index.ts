// Edge function: signup-with-payment
// Cria usuário + empresa + employee owner e, em seguida, cria a ASSINATURA
// recorrente no Asaas com o valor correto do ciclo escolhido, registrando a
// primeira fatura em public.company_invoices.
//
// A empresa nasce com status 'pending_payment' e só é ativada pelo webhook
// (asaas-webhook -> mark_subscription_invoice_paid) quando o pagamento entra.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

// ---------------------------------------------------------------------------
// Inlined de _shared/gateway-config.ts — o editor do painel Supabase não
// resolve imports relativos fora da pasta da própria função.
// ---------------------------------------------------------------------------
async function getGatewayConfig(
  adminClient: any,
  provider: string,
  key: string,
): Promise<string | undefined> {
  const envValue = (Deno.env.get(key) ?? "").trim();
  if (envValue) return envValue;

  const { data, error } = await adminClient
    .from("super_admin_gateway_configs")
    .select("value")
    .eq("provider", provider)
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`[gateway-config] erro ao ler ${provider}/${key}:`, error.message);
    return undefined;
  }
  return data?.value?.trim() || undefined;
}

type BillingPeriod = "monthly" | "quarterly" | "annual";
type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD";

const CYCLE_BY_PERIOD: Record<BillingPeriod, string> = {
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  annual: "YEARLY",
};

const PERIOD_LABEL: Record<BillingPeriod, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  annual: "Anual",
};

// Fallback de preços caso a base ainda não tenha os valores canônicos.
const FALLBACK_PRICES: Record<string, Record<BillingPeriod, number>> = {
  starter: { monthly: 79, quarterly: 213, annual: 708 },
  professional: { monthly: 149, quarterly: 402, annual: 1308 },
  enterprise: { monthly: 249, quarterly: 672, annual: 2268 },
};

function planKeyFromName(name: string): string | null {
  const n = (name ?? "").toLowerCase();
  if (n.includes("enterprise") || n.includes("diamante") || n.includes("business")) return "enterprise";
  if (n.includes("professional") || n.includes("ouro") || n.includes("pro")) return "professional";
  if (n.includes("starter") || n.includes("prata")) return "starter";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ ok: false, error: "Configuração do servidor ausente." }, 200);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => null);
    if (!body?.company) {
      return json({ ok: false, error: "Payload inválido." }, 200);
    }

    const c = body.company;
    const required = ["name", "slug", "owner_name", "owner_email", "cpf_cnpj"];
    for (const k of required) {
      if (!c[k]) return json({ ok: false, error: `Campo ${k} é obrigatório.` }, 200);
    }

    const billingPeriod: BillingPeriod = (["monthly", "quarterly", "annual"].includes(body.billing_period)
      ? body.billing_period
      : "monthly") as BillingPeriod;
    const billingType: BillingType = (["PIX", "BOLETO", "CREDIT_CARD"].includes(body.billing_type)
      ? body.billing_type
      : "PIX") as BillingType;

    // 1) Verifica slug livre
    const { data: slugExists } = await admin
      .from("companies")
      .select("id")
      .eq("slug", c.slug)
      .maybeSingle();
    if (slugExists) {
      return json({ ok: false, error: "Esse link personalizado já está em uso.", code: "slug_taken" }, 200);
    }

    // 1b) Plano + valor do ciclo
    let plan: any = null;
    if (body.plan_id) {
      const { data } = await admin
        .from("subscription_plans")
        .select("*")
        .eq("id", body.plan_id)
        .maybeSingle();
      plan = data ?? null;
    }
    if (!plan) return json({ ok: false, error: "Plano inválido." }, 200);

    const key = planKeyFromName(plan.name) ?? "starter";
    const priceFromDb =
      billingPeriod === "annual"
        ? Number(plan.annual_price ?? 0)
        : billingPeriod === "quarterly"
        ? Number(plan.quarterly_price ?? 0)
        : Number(plan.monthly_price ?? 0);
    const amount = priceFromDb > 0 ? priceFromDb : FALLBACK_PRICES[key][billingPeriod];

    if (!amount || amount <= 0) {
      return json({ ok: false, error: "Não foi possível determinar o valor do plano." }, 200);
    }

    // Cupom de aquisição validado no servidor antes de criar identidade/empresa.
    const couponCode = String(body.coupon_code ?? "").trim().toUpperCase();
    let couponConfig: any = null;
    if (couponCode) {
      if (!/^[A-Z0-9_-]{3,40}$/.test(couponCode)) return json({ ok: false, error: "Código de cupom inválido." }, 200);
      const { data: foundCoupon, error: couponLookupError } = await admin.from("subscription_coupons")
        .select("id,code,description,discount_type,discount_value,duration_type,duration_cycles,plan_ids,billing_periods,starts_at,expires_at,max_redemptions,is_active")
        .eq("code", couponCode).maybeSingle();
      if (couponLookupError) return json({ ok: false, error: "Não foi possível validar o cupom." }, 200);
      if (!foundCoupon || !foundCoupon.is_active) return json({ ok: false, error: "Cupom inválido ou inativo." }, 200);
      const nowMs = Date.now();
      if (foundCoupon.starts_at && nowMs < new Date(foundCoupon.starts_at).getTime()) return json({ ok: false, error: "Este cupom ainda não está válido." }, 200);
      if (foundCoupon.expires_at && nowMs > new Date(foundCoupon.expires_at).getTime()) return json({ ok: false, error: "Este cupom expirou." }, 200);
      if ((foundCoupon.plan_ids || []).length && !foundCoupon.plan_ids.includes(plan.id)) return json({ ok: false, error: "Este cupom não é válido para o plano selecionado." }, 200);
      if (!(foundCoupon.billing_periods || []).includes(billingPeriod)) return json({ ok: false, error: "Este cupom não é válido para o período selecionado." }, 200);
      if (foundCoupon.max_redemptions != null) {
        const { count, error: usageError } = await admin.from("subscription_coupon_redemptions")
          .select("id", { count: "exact", head: true }).eq("coupon_id", foundCoupon.id).in("status", ["reserved", "applied", "paid"]);
        if (usageError) return json({ ok: false, error: "Não foi possível verificar o limite deste cupom." }, 200);
        if ((count || 0) >= foundCoupon.max_redemptions) return json({ ok: false, error: "Este cupom atingiu o limite de utilizações." }, 200);
      }
      const discountAmount = foundCoupon.discount_type === "percentage"
        ? Number((amount * Math.min(100, Number(foundCoupon.discount_value)) / 100).toFixed(2))
        : Number(Math.min(amount, Number(foundCoupon.discount_value)).toFixed(2));
      const discountedAmount = Math.max(0, Number((amount - discountAmount).toFixed(2)));
      if (discountedAmount <= 0) return json({ ok: false, error: "O cupom não pode zerar a cobrança. Reduza o desconto para permitir a cobrança pelo Asaas." }, 200);
      couponConfig = { ...foundCoupon, discount_amount: discountAmount, discounted_amount: discountedAmount, duration_cycles: foundCoupon.duration_type === "first_payment" ? 1 : Number(foundCoupon.duration_cycles) };
    }

    // 2) A identidade Auth é global; a senha informada pertence somente à nova empresa.
    let userId: string | null = null;
    let createdNewAuthUser = false;
    const { data: existingUserId } = await admin.rpc("get_user_id_by_email", { _email: String(c.owner_email).trim() });

    if (existingUserId) {
      const { data: existingAuth, error: existingAuthError } = await admin.auth.admin.getUserById(existingUserId);
      if (existingAuthError || !existingAuth?.user) return json({ ok: false, error: "Não foi possível localizar a identidade existente." }, 200);
      userId = existingAuth.user.id;
    } else {
      // A identidade global NÃO recebe a senha empresarial.
      // O acesso do proprietário é contextual por empresa e fica em employees.password_hash,
      // seguindo a mesma arquitetura de identidade global usada no fluxo multiempresa.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: c.owner_email,
        email_confirm: true,
        user_metadata: { name: c.owner_name, phone: c.owner_phone, role: "owner" },
      });
      if (createErr || !created?.user) return json({ ok: false, error: createErr?.message || "Falha ao criar usuário." }, 200);
      userId = created.user.id; createdNewAuthUser = true;
    }

    // 3) Cria empresa — fallback removendo opcionais caso a coluna não exista.
    const fullPayload: Record<string, unknown> = {
      name: c.name,
      slug: c.slug,
      owner_name: c.owner_name,
      owner_email: c.owner_email,
      owner_phone: c.owner_phone ?? null,
      owner_cpf: c.cpf_cnpj,
      cnpj: c.cnpj ?? null,
      company_segment: c.company_segment ?? null,
      company_niche: c.company_niche ?? null,
      plan_id: plan.id,
      billing_period: billingPeriod,
      status: "pending_payment",
    };
    // ATENÇÃO: "status" NÃO entra aqui. Se ele for removido no fallback, a
    // empresa nasce com o default do banco ('active') e o cadastro é liberado
    // sem pagamento — exatamente o bug que estamos corrigindo.
    const optionalKeys = [
      "billing_period",
      "plan_id",
      "company_niche",
      "company_segment",
      "cnpj",
    ];


    let companyRow: { id: string } | null = null;
    let lastErr: string | null = null;
    const payload: Record<string, unknown> = { ...fullPayload };

    // Tentativas de inserção garantindo que plan_id e billing_period sejam mantidos se possível
    for (let attempt = 0; attempt <= optionalKeys.length; attempt++) {
      const { data, error } = await admin
        .from("companies")
        .insert(payload)
        .select("id")
        .single();
      
      if (!error && data) {
        companyRow = data;
        break;
      }
      
      lastErr = error?.message ?? "unknown";
      console.error(`[signup-with-payment] tentativa ${attempt} falhou:`, lastErr);

      const msg = lastErr.toLowerCase();
      const isSchema =
        msg.includes("column") ||
        msg.includes("does not exist") ||
        msg.includes("violates check") ||
        msg.includes("invalid input value");
      
      if (!isSchema) break;

      // Só removemos a chave se o erro indicar especificamente que a coluna não existe
      const columnNameMatch = lastErr.match(/column "([^"]+)" does not exist/i);
      if (columnNameMatch) {
        const missingCol = columnNameMatch[1];
        console.warn(`[signup-with-payment] Removendo coluna inexistente: ${missingCol}`);
        delete payload[missingCol];
        continue;
      }

      // Fallback genérico caso o regex falhe, mas tentando preservar plan_id e billing_period
      const drop = optionalKeys[attempt];
      if (!drop) break;
      delete payload[drop];
    }

    if (!companyRow) {
      if (createdNewAuthUser && userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json({ ok: false, error: `Falha ao criar empresa: ${lastErr}` }, 200);
    }

    const companyId = companyRow.id;
    let couponReservation: any = null;
    if (couponConfig) {
      const { data: reserved, error: reserveError } = await admin.rpc("reserve_subscription_coupon", {
        _code: couponCode,
        _company_id: companyId,
        _plan_id: plan.id,
        _billing_period: billingPeriod,
        _original_amount: amount,
      });
      if (reserveError || !reserved) {
        await admin.from("companies").delete().eq("id", companyId);
        if (createdNewAuthUser && userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
        return json({ ok: false, error: reserveError?.message || "Não foi possível reservar o cupom." }, 200);
      }
      couponReservation = reserved;
    }

    // Reforço: garante que nenhum default/trigger deixou a empresa ativa antes
    // do pagamento. Só o webhook do Asaas pode promover para 'active'.
    {
      const { error: statusErr } = await admin
        .from("companies")
        .update({ status: "pending_payment" })
        .eq("id", companyId);
      if (statusErr) {
        console.error("[signup-with-payment] falha ao forçar pending_payment:", statusErr.message);
      }
    }


    // 4) Cria employee owner — com fallback removendo colunas opcionais
    const empPayload: Record<string, unknown> = {
      company_id: companyId,
      user_id: userId,
      name: c.owner_name,
      email: c.owner_email,
      phone: c.owner_phone ?? null,
      role: "owner",
      employee_type: "fixo",
      is_active: true,
    };
    const empOptional = ["employee_type", "phone"];

    let empOk = false;
    let empLastErr: string | null = null;
    for (let i = 0; i <= empOptional.length; i++) {
      const { error: empErr } = await admin.from("employees").insert(empPayload);
      if (!empErr) {
        empOk = true;
        break;
      }
      empLastErr = empErr.message;
      console.error(`[signup-with-payment] employee tentativa ${i} falhou:`, empLastErr);
      const msg = empLastErr.toLowerCase();
      const isSchema =
        msg.includes("column") ||
        msg.includes("does not exist") ||
        msg.includes("violates check") ||
        msg.includes("invalid input value");
      if (!isSchema) break;
      const drop = empOptional[i];
      if (!drop) break;
      delete empPayload[drop];
    }

    if (!empOk) {
      await admin.from("companies").delete().eq("id", companyId);
      if (createdNewAuthUser && userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json(
        { ok: false, error: `Falha ao vincular usuário à empresa: ${empLastErr}` },
        200,
      );
    }

    const { data: ownerAccess, error: ownerAccessError } = await admin.rpc("create_owner_company_credential", {
      p_user_id: userId!, p_company_id: companyId, p_email: c.owner_email,
      p_password: null, p_name: c.owner_name, p_phone: c.owner_phone ?? null,
    });
    if (ownerAccessError || !ownerAccess?.success) {
      await admin.from("companies").delete().eq("id", companyId);
      if (createdNewAuthUser && userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json({ ok: false, error: ownerAccess?.error || ownerAccessError?.message || "Falha ao criar a credencial empresarial." }, 200);
    }
    // E-mail 1: confirmação de recebimento do cadastro, sem link de senha.
    const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    if (resendKey) {
      const from = (Deno.env.get("BILLING_EMAIL_FROM") || Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
        body: JSON.stringify({
          from,
          to: [c.owner_email],
          subject: "Zailom Booking — cadastro da empresa recebido",
          html: "<h2>Olá, " + c.owner_name + "!</h2><p>Recebemos o cadastro da empresa <strong>" + c.name + "</strong>.</p><p>Você receberá em seguida os detalhes da cobrança. Após a confirmação do pagamento, enviaremos um link para validar seu e-mail e criar a senha empresarial.</p>",
        }),
      }).catch((e) => console.error("[signup-with-payment] aviso de cadastro:", e));
    }

    // 5) Assinatura no Asaas ---------------------------------------------
    const ASAAS_API_KEY = (await getGatewayConfig(admin, "asaas", "ASAAS_API_KEY") ?? "").trim();
    if (!ASAAS_API_KEY) {
      console.error("[signup-with-payment] ASAAS_API_KEY ausente — cadastro criado sem cobrança.");
      return json({
        ok: true,
        company_id: companyId,
        user_id: userId,
        charge: false,
        message: "Cadastro criado, mas o gateway de pagamento não está configurado.",
      });
    }

    const isSandbox = ASAAS_API_KEY.includes("hmlg") || !ASAAS_API_KEY.startsWith("$aact_");
    const baseUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://www.asaas.com/api/v3";
    const headers = { access_token: ASAAS_API_KEY, "Content-Type": "application/json" };

    async function asaas(path: string, init: RequestInit = {}) {
      const r = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const text = await r.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* resposta não-JSON */ }
      if (!r.ok) {
        const msg = data?.errors?.[0]?.description || `Erro Asaas (${r.status})`;
        console.error(`[signup-with-payment] ${path} -> ${r.status} ${text}`);
        throw new Error(msg);
      }
      return data;
    }

    const cpfCnpj = String(c.cpf_cnpj ?? "").replace(/\D/g, "");
    let asaasSubscriptionId: string | null = null;
    let customerId: string | null = null;
    let firstPayment: any = null;
    let pixPayload: string | null = null;
    let pixQrCode: string | null = null;
    let chargeError: string | null = null;

    try {
      // 5a) Cliente Asaas por empresa. Nunca reutilizar globalmente por CPF/CNPJ.
      if (!customerId) {
        const createdCustomer = await asaas("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: c.owner_name || c.name,
            email: c.owner_email,
            cpfCnpj: cpfCnpj || undefined,
            mobilePhone: String(c.owner_phone ?? "").replace(/\D/g, "") || undefined,
            externalReference: `company:${companyId}`,
          }),
        });
        customerId = createdCustomer?.id ?? null;
      }
      if (!customerId) throw new Error("Falha ao criar cliente no Asaas.");

      // 5b) Assinatura recorrente com o valor do ciclo escolhido
      const today = new Date().toISOString().slice(0, 10);
      const subPayload: Record<string, unknown> = {
        customer: customerId,
        billingType,
        value: Number(amount),
        nextDueDate: today,
        cycle: CYCLE_BY_PERIOD[billingPeriod],
        description: `ZailomBooking ${plan.name} - ${PERIOD_LABEL[billingPeriod]}`,
        externalReference: `company:${companyId}`,
        // Não incluímos o objeto "callback" aqui para evitar conflitos com o Webhook configurado globalmente no painel do Asaas.
      };
      if (couponReservation && Number(couponReservation.duration_cycles) > 1) {
        const limit = new Date();
        const cycles = Number(couponReservation.duration_cycles);
        if (billingPeriod === "annual") limit.setFullYear(limit.getFullYear() + cycles);
        else if (billingPeriod === "quarterly") limit.setMonth(limit.getMonth() + cycles * 3);
        else limit.setMonth(limit.getMonth() + cycles);
        subPayload.discount = {
          value: Number(couponReservation.discount_value),
          type: couponReservation.discount_type === "percentage" ? "PERCENTAGE" : "FIXED",
          limitDate: limit.toISOString().slice(0, 10),
          dueDateLimitDays: 0,
        };
      }
      if (billingType === "CREDIT_CARD" && body.credit_card) {
        subPayload.creditCard = body.credit_card;
        subPayload.creditCardHolderInfo = body.credit_card_holder_info;
        subPayload.remoteIp =
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
      }

      const subscription = await asaas("/subscriptions", {
        method: "POST",
        body: JSON.stringify(subPayload),
      });
      asaasSubscriptionId = subscription?.id ?? null;

      // 5c) Primeira cobrança gerada pela assinatura
      if (asaasSubscriptionId) {
        for (let attempt = 0; attempt < 10 && !firstPayment; attempt++) {
          const payments = await asaas(`/subscriptions/${asaasSubscriptionId}/payments`, { method: "GET" });
          firstPayment = payments?.data?.[0] ?? null;
          if (!firstPayment && attempt < 9) await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (couponReservation && firstPayment?.id) {
          const expectedAmount = Number(couponReservation.discounted_amount);
          if (Math.abs(Number(firstPayment.value ?? amount) - expectedAmount) >= 0.01) {
            try {
              const adjusted = await asaas(`/payments/${firstPayment.id}`, {
                method: "PUT",
                body: JSON.stringify({ value: expectedAmount }),
              });
              firstPayment = { ...firstPayment, ...adjusted, value: expectedAmount };
            } catch (adjustError) {
              await asaas(`/subscriptions/${asaasSubscriptionId}`, { method: "DELETE" }).catch(() => {});
              asaasSubscriptionId = null;
              firstPayment = null;
              throw adjustError;
            }
          }
        }
        if (couponReservation && !firstPayment && asaasSubscriptionId) {
          await asaas(`/subscriptions/${asaasSubscriptionId}`, { method: "DELETE" }).catch(() => {});
          asaasSubscriptionId = null;
          throw new Error("O Asaas não gerou a primeira cobrança com o cupom. A assinatura foi cancelada para evitar cobrança pelo valor integral.");
        }
      }

      if (billingType === "PIX" && firstPayment?.id) {
        try {
          const pix = await asaas(`/payments/${firstPayment.id}/pixQrCode`, { method: "GET" });
          pixPayload = pix?.payload ?? null;
          pixQrCode = pix?.encodedImage ?? null;
        } catch (e) {
          console.warn("[signup-with-payment] pixQrCode falhou:", (e as Error).message);
        }
      }
    } catch (e) {
      chargeError = (e as Error).message;
      console.error("[signup-with-payment] erro no Asaas:", chargeError);
    }

    // 6) Persistência local ------------------------------------------------
    await admin
      .from("companies")
      .update({
        asaas_customer_id: customerId,
        asaas_subscription_id: asaasSubscriptionId,
      })
      .eq("id", companyId);

    // 6a) Assinatura local (fallback removendo colunas que possam não existir)
    const now = new Date();
    const cycleEnd = new Date(now.getTime() + 30 * 86400000);
    const subLocal: Record<string, unknown> = {
      company_id: companyId,
      plan_id: plan.id,
      billing_period: billingPeriod,
      status: "pending",
      billing_status: "suspended",
      cycle_start_at: now.toISOString(),
      next_renewal_at: cycleEnd.toISOString(),
      next_billing_date: cycleEnd.toISOString(),
      asaas_subscription_id: asaasSubscriptionId,
      original_price: Number(amount),
      discount_percentage: 0,
      discount_cycles_remaining: 0,
      ...(couponReservation ? {
        coupon_id: couponReservation.coupon_id,
        coupon_code: couponReservation.code,
        coupon_discount_type: couponReservation.discount_type,
        coupon_discount_value: Number(couponReservation.discount_value),
        coupon_cycles_remaining: Number(couponReservation.duration_cycles),
      } : {}),
    };
    const subOptional = [
      "asaas_subscription_id",
      "next_billing_date",
      "next_renewal_at",
      "cycle_start_at",
      "billing_status",
      "status",
      "billing_period",
    ];
    let localSubscriptionId: string | null = null;
    for (let i = 0; i <= subOptional.length; i++) {
      const { data: insertedSubscription, error } = await admin.from("company_subscriptions").insert(subLocal).select("id").single();
      if (!error) { localSubscriptionId = insertedSubscription?.id ?? null; break; }
      console.error(`[signup-with-payment] subscription tentativa ${i}:`, error.message);
      const drop = subOptional[i];
      if (!drop) break;
      delete subLocal[drop];
    }

    // 6b) Fatura local
    let invoiceId: string | null = null;
    if (firstPayment?.id) {
      const invLocal: Record<string, unknown> = {
        company_id: companyId,
        amount: Number(firstPayment?.value ?? couponReservation?.discounted_amount ?? amount),
        metadata: couponReservation ? { coupon_id: couponReservation.coupon_id, coupon_code: couponReservation.code, original_amount: Number(amount), discount_amount: Number(couponReservation.discount_amount), discounted_amount: Number(couponReservation.discounted_amount), discount_type: couponReservation.discount_type, discount_value: Number(couponReservation.discount_value), duration_cycles: Number(couponReservation.duration_cycles) } : {},
        status: "pending",
        kind: "subscription",
        billing_type: billingType,
        billing_period: billingPeriod,
        due_date: firstPayment?.dueDate ?? now.toISOString().slice(0, 10),
        cycle_start_at: now.toISOString(),
        cycle_end_at: cycleEnd.toISOString(),
        description: `Assinatura ${plan.name} — ${PERIOD_LABEL[billingPeriod]}`,
        asaas_payment_id: firstPayment.id,
        asaas_customer_id: customerId,
        invoice_url: firstPayment?.invoiceUrl ?? null,
        bank_slip_url: firstPayment?.bankSlipUrl ?? null,
        pix_payload: pixPayload,
        pix_qr_code: pixQrCode,
      };
      const invOptional = ["metadata", "cycle_end_at", "cycle_start_at", "billing_period", "kind", "description"];
      for (let i = 0; i <= invOptional.length; i++) {
        const { data, error } = await admin
          .from("company_invoices")
          .insert(invLocal)
          .select("id")
          .single();
        if (!error && data) {
          invoiceId = data.id;
          break;
        }
        console.error(`[signup-with-payment] invoice tentativa ${i}:`, error?.message);
        const drop = invOptional[i];
        if (!drop) break;
        delete invLocal[drop];
      }
      if (couponReservation && invoiceId) {
        await admin.from("subscription_coupon_redemptions").update({
          subscription_id: localSubscriptionId,
          invoice_id: invoiceId,
          status: "applied",
          updated_at: new Date().toISOString(),
        }).eq("id", couponReservation.redemption_id);
      }

      // E-mail 2: cobrança e link de pagamento enviados depois da criação da fatura.
      const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
      if (resendKey && invoiceId) {
        const from = (Deno.env.get("BILLING_EMAIL_FROM") || Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
        const paymentUrl = firstPayment?.invoiceUrl || firstPayment?.bankSlipUrl || "";
        const chargeValue = Number(firstPayment?.value ?? amount);
        const mailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
          body: JSON.stringify({
            from,
            to: [c.owner_email],
            subject: "Zailom Booking — cobrança para ativar sua empresa",
            html: "<h2>Cobrança para ativação</h2><p>Olá, " + c.owner_name + ".</p><p>Valor do plano " + plan.name + " (" + PERIOD_LABEL[billingPeriod] + "): <strong>R$ " + chargeValue.toFixed(2).replace(".", ",") + "</strong>.</p>" +
              (paymentUrl ? "<p><a href=\"" + paymentUrl + "\">Acessar cobrança e pagar</a></p>" : "<p>Abra o checkout para concluir o pagamento.</p>") +
              "<p>Após a confirmação do pagamento, enviaremos o link para validar seu e-mail e criar sua senha empresarial.</p>",
          }),
        });
        if (!mailResponse.ok) console.error("[signup-with-payment] Falha no e-mail da cobrança:", await mailResponse.text());
      }

      // Cartão aprovado na hora — o RPC mantém a empresa pendente até a senha ser criada.
      const status = String(firstPayment?.status ?? "").toUpperCase();
      if (["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(status) && invoiceId) {
        const { error: paidError } = await admin.rpc("mark_subscription_invoice_paid_v2", {
          _asaas_payment_id: firstPayment.id,
          _invoice_id: invoiceId,
          _paid_at: new Date().toISOString(),
        });
        if (!paidError) {
          // Pagamento com cartão pode confirmar antes de o webhook encontrar a fatura.
          // Garante que o link de criação de senha não se perca nessa corrida.
          const activationResendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
          if (activationResendKey && ownerAccess?.confirmation_token) {
            const from = (Deno.env.get("BILLING_EMAIL_FROM") || Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
            const siteUrl = (Deno.env.get("SITE_URL") || "https://booking.zailom.com").replace(/\/$/, "");
            const setupLink = siteUrl + "/confirmar-empresa?token=" + ownerAccess.confirmation_token;
            const setupResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + activationResendKey },
              body: JSON.stringify({
                from,
                to: [c.owner_email],
                subject: "Zailom Booking — pagamento confirmado, crie sua senha",
                html: "<h2>Pagamento confirmado!</h2><p>Recebemos o pagamento da empresa <strong>" + c.name + "</strong>.</p><p>Para concluir a ativação, confirme seu e-mail e crie sua senha empresarial:</p><p><a href='" + setupLink + "'>Confirmar e criar minha senha</a></p>",
              }),
            });
            if (setupResponse.ok) {
              await admin.from("owner_company_confirmations")
                .update({ password_setup_email_sent_at: new Date().toISOString() })
                .eq("company_id", companyId);
            } else {
              console.error("[signup-with-payment] Falha no e-mail de criação de senha:", await setupResponse.text());
            }
          }
        }
      }
    }

    if (couponReservation && (!asaasSubscriptionId || !firstPayment)) {
      await admin.from("subscription_coupon_redemptions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", couponReservation.redemption_id);
    }

    return json({
      ok: true,
      company_id: companyId,
      user_id: userId,
      charge: !!firstPayment,
      charge_error: chargeError,
      invoice_id: invoiceId,
      amount: Number(firstPayment?.value ?? couponReservation?.discounted_amount ?? amount),
      original_amount: amount,
      coupon: couponReservation ? { code: couponReservation.code, discount_amount: Number(couponReservation.discount_amount), discounted_amount: Number(couponReservation.discounted_amount), duration_cycles: Number(couponReservation.duration_cycles) } : null,
      billing_type: billingType,
      billing_period: billingPeriod,
      asaas_subscription_id: asaasSubscriptionId,
      environment: isSandbox ? "sandbox" : "production",
      message: firstPayment
        ? "Cadastro criado. Conclua o pagamento para liberar o acesso."
        : "Cadastro criado, mas não foi possível gerar a cobrança.",
    });
  } catch (err) {
    console.error("[signup-with-payment] erro fatal:", err);
    return json({ ok: false, error: (err as Error).message || "Erro inesperado." }, 200);
  }
});
