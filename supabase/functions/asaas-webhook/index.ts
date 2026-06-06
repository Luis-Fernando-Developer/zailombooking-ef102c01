import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.info(`[ASAAS_WEBHOOK] Received ${req.method} request at ${new Date().toISOString()}`)
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const rawBody = await req.text()
    console.info('[ASAAS_WEBHOOK] Raw body received:', rawBody)
    
    let body
    try {
      body = JSON.parse(rawBody)
    } catch (e) {
      console.error('[ASAAS_WEBHOOK] Failed to parse JSON body:', e.message)
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, 
      })
    }

    const event = (body.event || '').toUpperCase();
    const payment = body.payment || body; 
    const currentStatus = (payment?.status || body.status || '').toUpperCase();
    
    console.info(`[ASAAS_WEBHOOK] Body ID: ${body.id} | Evento: ${event} | Status Pagamento: ${currentStatus} | ID Pagamento Asaas: ${payment?.id}`)

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
      'CONFIRMED',
      'RECEIVED', 
      'SETTLED', 
      'AUTHORIZED',
      'RECEIVED_IN_CASH',
      'DEPOSITED',
      'DONE',
      'PAID'
    ];
    
    const isConfirmed = confirmedEvents.includes(event) || successStatuses.includes(currentStatus);

    let bookingId = payment?.externalReference || body.externalReference || body.payment?.externalReference;
    
    if (!bookingId && payment?.metadata?.booking_id) {
      bookingId = payment.metadata.booking_id;
    }

    if (!bookingId && (payment?.description || body.description || "")?.includes('#')) {
      const desc = payment?.description || body.description || "";
      const match = desc.match(/#([0-9a-f-]{36})/i);
      if (match) bookingId = match[1];
    }
    
    if (!bookingId) {
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const uuidMatch = rawBody.match(uuidRegex);
      if (uuidMatch) bookingId = uuidMatch[0];
    }

    console.info(`[ASAAS_WEBHOOK] Agendamento ID Extraído: ${bookingId} | Confirmado: ${isConfirmed}`)

    if (bookingId && isConfirmed) {
      const now = new Date().toISOString();
      
      console.info(`[ASAAS_WEBHOOK] Updating database for booking ${bookingId}`);
      
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
        .update({ 
          status: 'paid', 
          updated_at: now
        })
        .eq('booking_id', bookingId);

      if (bErr) console.error('[ASAAS_WEBHOOK] Bookings update error:', bErr);
      if (pErr) console.error('[ASAAS_WEBHOOK] Booking_payments update error:', pErr);
      
      console.info(`[ASAAS_WEBHOOK] DB updates completed for ${bookingId}`);
    } else if (bookingId && (event === 'PAYMENT_CREATED' || currentStatus === 'PENDING')) {
      console.info(`[ASAAS_WEBHOOK] Ensuring booking is pending for ${bookingId}`);
      await supabaseClient
        .from('bookings')
        .update({ payment_status: 'pending' })
        .eq('id', bookingId);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[ASAAS_WEBHOOK] Fatal error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})


