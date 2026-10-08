import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });

    const expectedToken = (await getGatewayConfig(supabaseClient, 'asaas', 'ASAAS_WEBHOOK_TOKEN') ?? '').trim();
    if (expectedToken) {
      const received = (
        req.headers.get('asaas-access-token') ||
        req.headers.get('Asaas-Access-Token') ||
        ''
      ).trim();
      if (received !== expectedToken) {
        console.warn(`[ASAAS_WEBHOOK][${requestId}] Token inválido (${received}) — requisição rejeitada`);
        return jsonResponse({ error: 'unauthorized_token_mismatch', received: true }, 200);
      }
    }

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
      'CHECKOUT_PAID',
      'PAYMENT_RECEIVED_IN_CASH'
    ];

    const successStatuses = [
      'CONFIRMED', 'RECEIVED', 'SETTLED', 'AUTHORIZED',
      'RECEIVED_IN_CASH', 'DEPOSITED', 'DONE', 'PAID', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'
    ];

    const failedEvents: Record<string, string> = {
      PAYMENT_OVERDUE: 'overdue',
      PAYMENT_DELETED: 'cancelled',
      PAYMENT_REFUNDED: 'refunded',
      PAYMENT_CHARGEBACK_REQUESTED: 'failed',
      PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'failed',
      PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'failed',
    };

    const isConfirmed = confirmedEvents.includes(event) || successStatuses.includes(currentStatus) || currentStatus === 'PAID' || currentStatus === 'RECEIVED' || currentStatus === 'CONFIRMED' || currentStatus.includes('CONFIRM') || currentStatus.includes('PAID');

    const externalRef: string =
      payment?.externalReference || body.externalReference || body.payment?.externalReference || '';

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
        const { data, error } = await supabaseClient.rpc('mark_subscription_invoice_paid_v2', {
          _asaas_payment_id: asaasPaymentId,
          _invoice_id: subscriptionInvoiceId,
          _paid_at: new Date().toISOString(),
        });
        
        if (error) {
          console.error(`[ASAAS_WEBHOOK][${requestId}] mark_paid_v2 erro (fallback v1):`, error.message);
          await supabaseClient.rpc('mark_subscription_invoice_paid', {
            _asaas_payment_id: asaasPaymentId,
            _invoice_id: subscriptionInvoiceId,
            _paid_at: new Date().toISOString(),
          });
          // Mesmo no fallback legado, não liberar o painel antes da criação da senha.
          const { data: pendingInvoice } = await supabaseClient
            .from('company_invoices').select('company_id').eq('id', subscriptionInvoiceId).maybeSingle();
          if (pendingInvoice?.company_id) {
            const { data: ownerLink } = await supabaseClient
              .from('owner_company_confirmations').select('id')
              .eq('company_id', pendingInvoice.company_id).is('confirmed_at', null).maybeSingle();
            if (ownerLink) {
              await supabaseClient.from('companies').update({ status: 'pending_payment' }).eq('id', pendingInvoice.company_id);
              await supabaseClient.from('company_subscriptions')
                .update({ status: 'pending', billing_status: 'active' }).eq('company_id', pendingInvoice.company_id);
            }
          }
        }

        const invoiceIdForChange =
          subscriptionInvoiceId ?? (data as any)?.invoice_id ?? null;
        if (invoiceIdForChange) {
          await supabaseClient.rpc('apply_paid_plan_change', { _invoice_id: invoiceIdForChange });
        }

        // E-mail 3: só após confirmação real do pagamento. O link leva à criação
        // da senha empresarial; a empresa continua pendente até essa etapa.
        try {
          const { data: paidInvoice } = await supabaseClient
            .from('company_invoices')
            .select('company_id, amount')
            .eq('id', subscriptionInvoiceId)
            .maybeSingle();
          if (paidInvoice?.company_id) {
            const { data: company } = await supabaseClient
              .from('companies')
              .select('id, name, owner_name, owner_email, status')
              .eq('id', paidInvoice.company_id)
              .maybeSingle();
            const { data: ownerLink } = await supabaseClient
              .from('owner_company_confirmations')
              .select('id, email, confirmation_token, confirmed_at, password_setup_email_sent_at')
              .eq('company_id', paidInvoice.company_id)
              .is('confirmed_at', null)
              .maybeSingle();
            const resendKey = (Deno.env.get('RESEND_API_KEY') ?? '').trim();
            if (company && ownerLink && !ownerLink.password_setup_email_sent_at && resendKey) {
              const from = (Deno.env.get('BILLING_EMAIL_FROM') || Deno.env.get('CLIENT_ACCESS_EMAIL_FROM') || 'Zailom Booking <atendimento@suport-mail.booking.zailom.com>').trim();
              const siteUrl = (Deno.env.get('SITE_URL') || 'https://booking.zailom.com').replace(/\/$/, '');
              const setupLink = siteUrl + '/confirmar-empresa?token=' + ownerLink.confirmation_token;
              const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + resendKey },
                body: JSON.stringify({
                  from,
                  to: [ownerLink.email || company.owner_email],
                  subject: 'Zailom Booking — pagamento confirmado, crie sua senha',
                  html: '<h2>Pagamento confirmado!</h2><p>Olá, ' + (company.owner_name || 'empreendedor') + '.</p><p>Recebemos o pagamento da empresa <strong>' + company.name + '</strong>.</p><p>Para concluir a ativação, confirme seu e-mail e crie uma senha exclusiva para esta empresa:</p><p><a href="' + setupLink + '">Confirmar e criar minha senha</a></p>',
                }),
              });
              if (emailResponse.ok) {
                await supabaseClient.from('owner_company_confirmations')
                  .update({ password_setup_email_sent_at: new Date().toISOString() })
                  .eq('id', ownerLink.id)
                  .is('password_setup_email_sent_at', null);
              } else {
                console.error('[ASAAS_WEBHOOK][' + requestId + '] Falha ao enviar link de criação de senha:', await emailResponse.text());
              }
            }
          }
        } catch (activationEmailError) {
          console.error('[ASAAS_WEBHOOK][' + requestId + '] Erro no e-mail de ativação:', activationEmailError);
        }

      } else if (failedEvents[event]) {
        await supabaseClient.rpc('mark_subscription_invoice_status', {
          _asaas_payment_id: asaasPaymentId,
          _status: failedEvents[event],
        });
      }

      return jsonResponse({ success: true, kind: 'subscription' }, 200);
    }

    let bookingId = externalRef || null;
    if (bookingId && bookingId.includes(':')) bookingId = null;
    
    // Fallback 1: Metadata
    if (!bookingId && payment?.metadata?.booking_id) {
      bookingId = payment.metadata.booking_id;
    }
    
    // Fallback 2: Lookup by asaas_id in booking_payments
    if (!bookingId && asaasPaymentId) {
      console.info(`[ASAAS_WEBHOOK][${requestId}] Tentando localizar booking_id via asaas_id=${asaasPaymentId}`);
      try {
        const { data: payRow, error: payErr } = await supabaseClient
          .from('booking_payments')
          .select('booking_id')
          .eq('asaas_id', asaasPaymentId)
          .maybeSingle();
        
        if (payRow?.booking_id) {
          bookingId = payRow.booking_id;
          console.info(`[ASAAS_WEBHOOK][${requestId}] Localizado via asaas_id: ${bookingId}`);
        } else if (payErr) {
          console.error(`[ASAAS_WEBHOOK][${requestId}] Erro ao buscar via asaas_id (schema issue?):`, payErr.message);
        }
      } catch (e) {
        console.error(`[ASAAS_WEBHOOK][${requestId}] Exceção ao buscar via asaas_id:`, (e as any).message);
      }
    }

    // Fallback 3: Description regex
    if (!bookingId && (payment?.description || body.description || "")?.includes('#')) {
      const desc = payment?.description || body.description || "";
      const match = desc.match(/#([0-9a-f-]{36})/i);
      if (match) bookingId = match[1];
    }
    
    // Fallback 4: Raw UUID anywhere in body
    if (!bookingId) {
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const uuidMatch = rawBody.match(uuidRegex);
      if (uuidMatch) bookingId = uuidMatch[0];
    }

    console.info(`[ASAAS_WEBHOOK][${requestId}] Agendamento Resolvido: ${bookingId} | Confirmado: ${isConfirmed}`)


    if (asaasPaymentId && isConfirmed) {
      // O pagamento online pode existir antes do booking. Nesse caso,
      // atualizamos somente booking_payments; o Booking.tsx fará o vínculo
      // ao criar o agendamento após a confirmação.
      const { data: pendingPayment, error: pendingPaymentError } = await supabaseClient
        .from('booking_payments')
        .select('id, booking_id')
        .eq('asaas_id', asaasPaymentId)
        .maybeSingle();

      if (pendingPaymentError) {
        console.error(`[ASAAS_WEBHOOK][${requestId}] Erro ao localizar booking_payments:`, pendingPaymentError.message);
      } else if (pendingPayment && !pendingPayment.booking_id) {
        const { error: pendingUpdateError } = await supabaseClient
          .from('booking_payments')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', pendingPayment.id);

        if (pendingUpdateError) {
          console.error(`[ASAAS_WEBHOOK][${requestId}] Erro ao marcar pagamento pendente como pago:`, pendingUpdateError.message);
        } else {
          console.info(`[ASAAS_WEBHOOK][${requestId}] Pagamento ${asaasPaymentId} confirmado antes do booking.`);
        }
      }
    }

    if (bookingId && isConfirmed) {
      const now = new Date().toISOString();
      const { data: beforeBooking } = await supabaseClient
        .from('bookings')
        .select('payment_status, booking_status')
        .eq('id', bookingId)
        .maybeSingle();
      const paymentWasAlreadyConfirmed =
        ['confirmed', 'paid', 'received', 'settled'].includes(
          String(beforeBooking?.payment_status ?? '').toLowerCase()
        );
      const bookingWasAlreadyConfirmed =
        String(beforeBooking?.booking_status ?? '').toLowerCase() === 'confirmed';

      console.info(`[ASAAS_WEBHOOK][${requestId}] Marcando booking ${bookingId} como PAGO. Event: ${event}, Status: ${currentStatus}`);

      // Update payment record FIRST with asaas_id for polling stability
      const { data: pData, error: pErr } = await supabaseClient
        .from('booking_payments')
        .update({ 
          status: 'confirmed',
          updated_at: now,
          asaas_id: asaasPaymentId
        })
        .eq('booking_id', bookingId)
        .select();

      // Update booking
      const { data: bData, error: bErr } = await supabaseClient
        .from('bookings')
        .update({
          payment_status: 'confirmed',
          booking_status: 'confirmed',
          updated_at: now
        })
        .eq('id', bookingId)
        .select();

      if (bErr) console.error(`[ASAAS_WEBHOOK][${requestId}] Bookings update error:`, bErr);
      else console.info(`[ASAAS_WEBHOOK][${requestId}] Bookings update success:`, bData);
      
      if (pErr) console.error(`[ASAAS_WEBHOOK][${requestId}] Booking_payments update error:`, pErr);
      else console.info(`[ASAAS_WEBHOOK][${requestId}] Booking_payments update success:`, pData);

      if (!bErr && !pErr) {
        const notifyHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        };

        // O webhook é a fonte de verdade para confirmações feitas diretamente
        // no Asaas. Por isso ele também dispara payment_confirmed.
        if (!paymentWasAlreadyConfirmed) {
          try {
            const paymentNotify = await fetch(`${supabaseUrl}/functions/v1/notify-booking-event`, {
              method: 'POST',
              headers: notifyHeaders,
              body: JSON.stringify({ booking_id: bookingId, event_key: 'payment_confirmed' }),
            });
            if (!paymentNotify.ok) {
              console.error(
                `[ASAAS_WEBHOOK][${requestId}] payment_confirmed notify HTTP ${paymentNotify.status}:`,
                await paymentNotify.text()
              );
            }
          } catch (e) {
            console.error(`[ASAAS_WEBHOOK][${requestId}] payment_confirmed notify error:`, (e as any)?.message);
          }
        }

        // Só envia booking_confirmed na transição real para confirmado.
        if (!bookingWasAlreadyConfirmed) {
          try {
            const bookingNotify = await fetch(`${supabaseUrl}/functions/v1/notify-booking-event`, {
              method: 'POST',
              headers: notifyHeaders,
              body: JSON.stringify({ booking_id: bookingId, event_key: 'booking_confirmed' }),
            });
            if (!bookingNotify.ok) {
              console.error(
                `[ASAAS_WEBHOOK][${requestId}] booking_confirmed notify HTTP ${bookingNotify.status}:`,
                await bookingNotify.text()
              );
            }
          } catch (e) {
            console.error(`[ASAAS_WEBHOOK][${requestId}] booking_confirmed notify error:`, (e as any)?.message);
          }
        }
      }
    }

    return jsonResponse({ success: true, kind: 'booking' }, 200)
  } catch (error) {
    console.error(`[ASAAS_WEBHOOK][${requestId}] Fatal error:`, (error as Error).message, (error as Error).stack)
    // Retornamos 200 OK mesmo em erro fatal para evitar que o Asaas desative o webhook por falhas consecutivas
    return jsonResponse({ error: (error as Error).message, stack: (error as Error).stack, fatal: true }, 200)
  }
})