import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

serve(async (req) => {
  const requestId = crypto.randomUUID().substring(0, 8);
  console.info(`[ASAAS_WEBHOOK][${requestId}] Received ${req.method} request`);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ---- 0) Validação do token do webhook ---------------------------------
    // Configure o mesmo valor em Asaas > Integrações > Webhooks (campo "Token").
    const expectedToken = (Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '').trim();
    if (expectedToken) {
      const received = (
        req.headers.get('asaas-access-token') ||
        req.headers.get('Asaas-Access-Token') ||
        ''
      ).trim();
      if (received !== expectedToken) {
        console.warn(`[ASAAS_WEBHOOK][${requestId}] Token inválido — requisição rejeitada`);
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
    } else {
      console.warn(`[ASAAS_WEBHOOK][${requestId}] ASAAS_WEBHOOK_TOKEN não configurado — validação desativada`);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });

    const rawBody = await req.text()
    console.info(`[ASAAS_WEBHOOK][${requestId}] Raw body:`, rawBody)

    let body
    try {
      body = JSON.parse(rawBody)
    } catch (e) {
      console.error(`[ASAAS_WEBHOOK][${requestId}] JSON parse error:`, (e as Error).message)
      return jsonResponse({ error: 'Invalid JSON', received: true }, 200)
    }

    const event = (body.event || '').toUpperCase();
    const payment = body.payment || body;
    const currentStatus = (payment?.status || body.status || '').toUpperCase();
    const asaasPaymentId: string | null = payment?.id ?? null;

    console.info(`[ASAAS_WEBHOOK][${requestId}] Evento: ${event} | Status: ${currentStatus} | Pagamento: ${asaasPaymentId}`)

    const confirmedEvents = [
      'PAYMENT_CONFIRMED',
      'PAYMENT_RECEIVED',
      'PAYMENT_SETTLED',
      'PAYMENT_AUTHORIZED',
      'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
      'PAYMENT_ANTICIPATED',
      'PAYMENT_DEPOSITED',
      'PAYMENT_CREDIT_CARD_CAPTURE_CONFIRMED',
      'CHECKOUT_PAID'
    ];

    const successStatuses = [
      'CONFIRMED', 'RECEIVED', 'SETTLED', 'AUTHORIZED',
      'RECEIVED_IN_CASH', 'DEPOSITED', 'DONE', 'PAID'
    ];

    const failedEvents: Record<string, string> = {
      PAYMENT_OVERDUE: 'overdue',
      PAYMENT_DELETED: 'cancelled',
      PAYMENT_REFUNDED: 'refunded',
      PAYMENT_CHARGEBACK_REQUESTED: 'failed',
      PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'failed',
      PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'failed',
    };

    const isConfirmed = confirmedEvents.includes(event) || successStatuses.includes(currentStatus);

    const externalRef: string =
      payment?.externalReference || body.externalReference || body.payment?.externalReference || '';

    // =====================================================================
    // ROTA A — Fatura de ASSINATURA da plataforma
    // externalReference = "subscription:<invoice_id>:<company_id>"
    // Fallback: fatura já vinculada pelo asaas_payment_id.
    // =====================================================================
    let subscriptionInvoiceId: string | null = null;
    if (externalRef.startsWith('subscription:')) {
      subscriptionInvoiceId = externalRef.split(':')[1] ?? null;
    }

    let isSubscriptionCharge = !!subscriptionInvoiceId;
    if (!isSubscriptionCharge && asaasPaymentId) {
      const { data: linked } = await supabaseClient
        .from('company_invoices')
        .select('id')
        .eq('asaas_payment_id', asaasPaymentId)
        .maybeSingle();
      if (linked?.id) {
        isSubscriptionCharge = true;
        subscriptionInvoiceId = linked.id;
      }
    }

    if (isSubscriptionCharge) {
      console.info(`[ASAAS_WEBHOOK][${requestId}] Cobrança de ASSINATURA | fatura=${subscriptionInvoiceId}`);

      if (isConfirmed) {
        const { data, error } = await supabaseClient.rpc('mark_subscription_invoice_paid', {
          _asaas_payment_id: asaasPaymentId,
          _invoice_id: subscriptionInvoiceId,
          _paid_at: new Date().toISOString(),
        });
        if (error) console.error(`[ASAAS_WEBHOOK][${requestId}] mark_paid erro:`, error.message);
        else console.info(`[ASAAS_WEBHOOK][${requestId}] mark_paid:`, JSON.stringify(data));

        // Se a fatura era de proração de upgrade, aplica a troca de plano agora.
        const invoiceIdForChange =
          subscriptionInvoiceId ?? (data as any)?.invoice_id ?? null;
        if (invoiceIdForChange) {
          const { data: applied, error: applyErr } = await supabaseClient.rpc(
            'apply_paid_plan_change',
            { _invoice_id: invoiceIdForChange },
          );
          if (applyErr) {
            console.error(`[ASAAS_WEBHOOK][${requestId}] apply_plan_change erro:`, applyErr.message);
          } else {
            console.info(`[ASAAS_WEBHOOK][${requestId}] apply_plan_change:`, JSON.stringify(applied));
          }
        }

      } else if (failedEvents[event]) {
        const { error } = await supabaseClient.rpc('mark_subscription_invoice_status', {
          _asaas_payment_id: asaasPaymentId,
          _status: failedEvents[event],
        });
        if (error) console.error(`[ASAAS_WEBHOOK][${requestId}] mark_status erro:`, error.message);
      }

      return jsonResponse({ success: true, kind: 'subscription' }, 200);
    }

    // =====================================================================
    // ROTA B — Pagamento de AGENDAMENTO (cliente final -> empresa)
    // =====================================================================
    let bookingId = externalRef || null;

    if (bookingId && bookingId.includes(':')) bookingId = null; // ref de outro domínio

    if (!bookingId && payment?.metadata?.booking_id) {
      bookingId = payment.metadata.booking_id;
    }

    if (!bookingId && (payment?.description || body.description || "")?.includes('#')) {
      const desc = payment?.description || body.description || "";
      const match = desc.match(/#([0-9a-f-]{36})/i);
      if (match) bookingId = match[1];
    }

    if (!bookingId) {
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const uuidMatch = rawBody.match(uuidRegex);
      if (uuidMatch) bookingId = uuidMatch[0];
    }

    console.info(`[ASAAS_WEBHOOK][${requestId}] Agendamento: ${bookingId} | Confirmado: ${isConfirmed}`)

    if (bookingId && isConfirmed) {
      const now = new Date().toISOString();

      const { error: bErr } = await supabaseClient
        .from('bookings')
        .update({
          booking_status: 'confirmed',
          payment_status: 'confirmed',
          updated_at: now
        })
        .eq('id', bookingId);

      const { error: pErr } = await supabaseClient
        .from('booking_payments')
        .update({ status: 'paid', updated_at: now })
        .eq('booking_id', bookingId);

      if (bErr) console.error(`[ASAAS_WEBHOOK][${requestId}] Bookings update error:`, bErr);
      if (pErr) console.error(`[ASAAS_WEBHOOK][${requestId}] Booking_payments update error:`, pErr);

      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-booking-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ booking_id: bookingId, event_key: 'booking_confirmed' }),
        });
      } catch (e) { console.error(`[ASAAS_WEBHOOK][${requestId}] notify error:`, (e as any)?.message); }
    } else if (bookingId && (event === 'PAYMENT_CREATED' || currentStatus === 'PENDING')) {
      await supabaseClient
        .from('bookings')
        .update({ payment_status: 'pending' })
        .eq('id', bookingId);
    }

    return jsonResponse({ success: true, kind: 'booking' }, 200)
  } catch (error) {
    console.error(`[ASAAS_WEBHOOK][${requestId}] Fatal error:`, (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 200)
  }
})
