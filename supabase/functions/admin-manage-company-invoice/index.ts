import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function gatewayConfig(admin: any, key: string): Promise<string> {
  const env = (Deno.env.get(key) || "").trim();
  if (env) return env;
  const { data } = await admin.from("super_admin_gateway_configs")
    .select("value").eq("provider", "asaas").eq("key", key).maybeSingle();
  return String(data?.value || "").trim();
}

function localStatus(status: string): string {
  const value = String(status || "").toUpperCase();
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "SETTLED", "DEPOSITED"].includes(value)) return "paid";
  if (["OVERDUE"].includes(value)) return "overdue";
  if (["REFUNDED", "REFUND_IN_PROGRESS", "REFUND_REQUESTED"].includes(value)) return "refunded";
  if (["DELETED", "CANCELLED"].includes(value)) return "cancelled";
  if (["PENDING", "AWAITING_RISK_ANALYSIS", "DUNNING_REQUESTED", "DUNNING_RECEIVED"].includes(value)) return "pending";
  if (["CONFIRMED", "RECEIVED"].includes(value)) return "paid";
  if (["FAILED", "REPROVED_BY_RISK_ANALYSIS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(value)) return "failed";
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Configuração do servidor incompleta." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const token = authHeader.slice(7);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);
    const user = userData.user;

    const { data: adminRole } = await admin.from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) return json({ error: "Acesso restrito ao Super Admin." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const invoiceId = String(body.invoice_id || "");
    if (!["list", "refresh", "resend", "cancel", "refund", "regenerate"].includes(action)) return json({ error: "Ação inválida." }, 400);

    if (action === "list") {
      const companyId = String(body.company_id || "");
      if (!companyId) return json({ error: "ID da empresa não informado." }, 400);
      const { data: invoices, error: listError } = await admin.from("company_invoices")
        .select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100);
      if (listError) throw listError;
      const { data: history, error: historyError } = await admin.from("company_invoice_admin_audit")
        .select("id,company_id,invoice_id,actor_user_id,action,previous_status,resulting_status,details,created_at")
        .eq("company_id", companyId).order("created_at", { ascending: false }).limit(100);
      if (historyError) throw historyError;
      return json({ success: true, invoices: invoices || [], history: history || [] });
    }

    if (!invoiceId) return json({ error: "Fatura não informada." }, 400);

    const { data: invoice, error: invoiceError } = await admin.from("company_invoices")
      .select("*").eq("id", invoiceId).maybeSingle();
    if (invoiceError || !invoice) return json({ error: "Fatura não encontrada." }, 404);

    const { data: company, error: companyError } = await admin.from("companies")
      .select("id,name,owner_name,owner_email,owner_phone,asaas_customer_id,asaas_subscription_id,status")
      .eq("id", invoice.company_id).maybeSingle();
    if (companyError || !company) return json({ error: "Empresa não encontrada." }, 404);

    const audit = async (event: string, previous: string | null, resulting: string | null, details: Record<string, unknown> = {}) => {
      const { error } = await admin.from("company_invoice_admin_audit").insert({
        company_id: company.id, invoice_id: invoice.id, actor_user_id: user.id,
        action: event, previous_status: previous, resulting_status: resulting, details,
      });
      if (error) console.error("[invoice-admin] audit insert failed", error.message);
    };

    const asaasKey = await gatewayConfig(admin, "ASAAS_API_KEY");
    if (!asaasKey && action !== "resend") return json({ error: "A chave do Asaas não está configurada." }, 500);
    const sandbox = asaasKey.includes("hmlg") || !asaasKey.startsWith("$aact_");
    const baseUrl = sandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";
    const asaas = async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers || {});
      headers.set("access_token", asaasKey);
      headers.set("Content-Type", "application/json");
      const response = await fetch(baseUrl + path, { ...init, headers });
      const raw = await response.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
      if (!response.ok) throw new Error(data?.errors?.[0]?.description || data?.message || `Asaas retornou HTTP ${response.status}`);
      return data;
    };

    const saveStatus = async (status: string, extra: Record<string, unknown> = {}) => {
      const { error } = await admin.from("company_invoices").update({
        status, updated_at: new Date().toISOString(), ...extra,
      }).eq("id", invoice.id);
      if (error) throw error;
    };

    if (action === "refresh") {
      if (!invoice.asaas_payment_id) return json({ error: "Esta fatura ainda não possui um ID de pagamento no Asaas." }, 400);
      const payment = await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`);
      const status = localStatus(payment.status);
      if (!status) return json({ error: `Status Asaas não mapeado: ${payment.status || "desconhecido"}.`, payment_status: payment.status }, 409);
      await saveStatus(status, {
        paid_at: status === "paid" ? (payment.paymentDate || payment.clientPaymentDate || new Date().toISOString()) : invoice.paid_at,
        invoice_url: payment.invoiceUrl || invoice.invoice_url,
        bank_slip_url: payment.bankSlipUrl || invoice.bank_slip_url,
        billing_type: payment.billingType || invoice.billing_type,
        due_date: payment.dueDate ? new Date(payment.dueDate + "T12:00:00.000Z").toISOString() : invoice.due_date,
      });
      if (status === "paid") {
        await admin.rpc("mark_subscription_invoice_paid_v2", {
          _asaas_payment_id: invoice.asaas_payment_id, _invoice_id: invoice.id,
          _paid_at: payment.paymentDate || payment.clientPaymentDate || new Date().toISOString(),
        });
      }
      await audit("refresh_status", invoice.status, status, { asaas_status: payment.status });
      return json({ success: true, status, asaas_status: payment.status });
    }

    if (action === "resend") {
      if (!company.owner_email) return json({ error: "A empresa não possui e-mail do proprietário." }, 400);
      const resendKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
      if (!resendKey) return json({ error: "RESEND_API_KEY não está configurada." }, 500);
      let paymentLink = invoice.invoice_url || invoice.bank_slip_url || "";
      let asaasStatus: string | null = null;
      if (invoice.asaas_payment_id && asaasKey) {
        const payment = await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`);
        asaasStatus = payment.status;
        const mapped = localStatus(payment.status);
        if (mapped === "paid") return json({ error: "Esta cobrança já consta como paga. Atualize o status antes de reenviar." }, 409);
        if (["cancelled", "refunded", "failed"].includes(mapped)) return json({ error: "Esta cobrança não está mais ativa. Use Gerar nova cobrança." }, 409);
        paymentLink = payment.invoiceUrl || payment.bankSlipUrl || paymentLink;
      }
      if (!paymentLink) return json({ error: "Não há link de pagamento nesta fatura." }, 400);
      const from = (Deno.env.get("BILLING_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
      const amount = Number(invoice.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
        body: JSON.stringify({
          from, to: [company.owner_email],
          subject: `Zailom Booking — cobrança da empresa ${company.name}`,
          html: `<h2>Link para pagamento</h2><p>Olá, ${company.owner_name || "cliente"}.</p><p>Empresa: <strong>${company.name}</strong></p><p>Valor: <strong>${amount}</strong></p><p>Vencimento: <strong>${new Date(invoice.due_date).toLocaleDateString("pt-BR")}</strong></p><p><a href="${paymentLink}">Acessar cobrança e pagar</a></p><p>Se você já realizou o pagamento, desconsidere esta mensagem.</p>`,
        }),
      });
      if (!response.ok) throw new Error("Falha ao enviar e-mail de cobrança: " + (await response.text()).slice(0, 300));
      await audit("resend_charge", invoice.status, invoice.status, { recipient: company.owner_email, asaas_status: asaasStatus });
      return json({ success: true, message: "Cobrança reenviada por e-mail." });
    }

    if (action === "cancel") {
      if (["paid", "refunded"].includes(String(invoice.status))) return json({ error: "Não é possível cancelar uma fatura paga ou reembolsada." }, 409);
      let providerStatus: string | null = null;
      if (invoice.asaas_payment_id) {
        const current = await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`);
        providerStatus = current.status;
        const mapped = localStatus(current.status);
        if (mapped === "paid") return json({ error: "O Asaas informa que esta cobrança foi paga. Atualize o status em vez de cancelar." }, 409);
        if (!["cancelled", "failed"].includes(mapped)) {
          await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`, { method: "DELETE" });
          const verify = await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`);
          providerStatus = verify.status;
          if (!["DELETED", "CANCELLED"].includes(String(verify.status).toUpperCase())) {
            return json({ error: "O Asaas não confirmou o cancelamento. Nenhuma nova cobrança foi criada.", asaas_status: verify.status }, 409);
          }
        }
      }
      await saveStatus("cancelled");
      await audit("cancel_charge", invoice.status, "cancelled", { asaas_status: providerStatus });
      return json({ success: true, status: "cancelled" });
    }

    if (action === "refund") {
      if (invoice.status !== "paid" || !invoice.asaas_payment_id) return json({ error: "Somente faturas pagas com ID Asaas podem ser reembolsadas." }, 409);
      const current = await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`);
      if (!["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "SETTLED"].includes(String(current.status).toUpperCase())) {
        return json({ error: `O Asaas não permite reembolso para o status ${current.status}.` }, 409);
      }
      const refund = await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}/refund`, { method: "POST", body: JSON.stringify({}) });
      const refundStatus = localStatus(refund.status || "REFUNDED");
      await saveStatus(refundStatus === "refunded" ? "refunded" : "refunded", {
        metadata: { ...(invoice.metadata || {}), admin_refund_requested_at: new Date().toISOString(), asaas_refund_status: refund.status || "requested" },
      });
      await audit("refund_charge", invoice.status, "refunded", { asaas_status: current.status, refund_status: refund.status || "requested" });
      return json({ success: true, status: "refunded", refund_status: refund.status || "requested" });
    }

    // regenerate: cancelar a cobrança anterior no Asaas e confirmar que não pode mais ser paga
    if (!["overdue", "cancelled", "failed"].includes(String(invoice.status))) {
      return json({ error: "Só é possível gerar uma nova cobrança para uma fatura vencida, cancelada ou com falha." }, 409);
    }
    if (invoice.asaas_payment_id) {
      const oldPayment = await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`);
      const oldProviderStatus = String(oldPayment.status || "").toUpperCase();
      if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "SETTLED", "DEPOSITED"].includes(oldProviderStatus)) {
        await saveStatus("paid", { paid_at: oldPayment.paymentDate || oldPayment.clientPaymentDate || new Date().toISOString() });
        await admin.rpc("mark_subscription_invoice_paid_v2", {
          _asaas_payment_id: invoice.asaas_payment_id, _invoice_id: invoice.id,
          _paid_at: oldPayment.paymentDate || oldPayment.clientPaymentDate || new Date().toISOString(),
        });
        return json({ error: "A cobrança antiga já foi paga. A fatura foi atualizada e nenhuma cobrança duplicada foi criada." }, 409);
      }
      if (!["DELETED", "CANCELLED", "REFUNDED"].includes(oldProviderStatus)) {
        await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`, { method: "DELETE" });
        const verify = await asaas(`/payments/${encodeURIComponent(invoice.asaas_payment_id)}`);
        if (!["DELETED", "CANCELLED"].includes(String(verify.status).toUpperCase())) {
          return json({ error: "Não foi possível confirmar o cancelamento da cobrança anterior. Para evitar pagamento duplicado, nenhuma nova cobrança foi gerada.", asaas_status: verify.status }, 409);
        }
      }
    }

    const customerId = invoice.asaas_customer_id || company.asaas_customer_id;
    if (!customerId) return json({ error: "Empresa sem cliente vinculado no Asaas. Corrija o cadastro do cliente antes de gerar nova cobrança." }, 400);
    const billingType = ["PIX", "BOLETO", "CREDIT_CARD"].includes(String(invoice.billing_type).toUpperCase()) ? String(invoice.billing_type).toUpperCase() : "PIX";
    const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const newDescription = invoice.description || `Assinatura Zailom Booking — ${company.name}`;
    const { data: newInvoice, error: createInvoiceError } = await admin.from("company_invoices").insert({
      company_id: company.id,
      subscription_id: invoice.subscription_id || null,
      amount: invoice.amount,
      status: "pending",
      billing_type: billingType,
      due_date: dueDate + "T12:00:00.000Z",
      description: newDescription + " (nova cobrança)",
      cycle_start_at: null,
      cycle_end_at: null,
      kind: invoice.kind || "subscription",
      asaas_customer_id: customerId,
      metadata: { ...(invoice.metadata || {}), replaced_invoice_id: invoice.id, replacement_created_at: new Date().toISOString() },
    }).select("id").single();
    if (createInvoiceError || !newInvoice) throw createInvoiceError || new Error("Não foi possível registrar a nova fatura.");

    try {
      const payment = await asaas("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          billingType,
          value: Number(invoice.amount),
          dueDate,
          description: newDescription + " (nova cobrança)",
          externalReference: `subscription:${newInvoice.id}:${company.id}`,
        }),
      });
      if (!payment?.id) throw new Error("O Asaas não retornou o ID da nova cobrança.");
      await admin.from("company_invoices").update({
        asaas_payment_id: payment.id,
        invoice_url: payment.invoiceUrl || null,
        bank_slip_url: payment.bankSlipUrl || null,
        updated_at: new Date().toISOString(),
      }).eq("id", newInvoice.id);
      if (invoice.status === "overdue") {
        await saveStatus("cancelled", { metadata: { ...(invoice.metadata || {}), replaced_by_invoice_id: newInvoice.id } });
      }
      await audit("generate_replacement_charge", invoice.status, "cancelled", { replacement_invoice_id: newInvoice.id, new_asaas_payment_id: payment.id });
      await admin.from("company_invoice_admin_audit").insert({
        company_id: company.id, invoice_id: newInvoice.id, actor_user_id: user.id,
        action: "replacement_charge_created", previous_status: null, resulting_status: "pending",
        details: { replaced_invoice_id: invoice.id, asaas_payment_id: payment.id },
      });
      return json({ success: true, invoice_id: newInvoice.id, asaas_payment_id: payment.id, invoice_url: payment.invoiceUrl || payment.bankSlipUrl || null });
    } catch (error) {
      await admin.from("company_invoices").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", newInvoice.id);
      throw error;
    }
  } catch (error) {
    console.error("[admin-manage-company-invoice]", error);
    return json({ error: error instanceof Error ? error.message : "Falha ao gerenciar cobrança." }, 500);
  }
});
