import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log(`[ASAAS_WEBHOOK] Request method: ${req.method}`)
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const rawBody = await req.text()
    console.log('[ASAAS_WEBHOOK] Raw body:', rawBody)
    
    let body
    try {
      body = JSON.parse(rawBody)
    } catch (e) {
      console.error('[ASAAS_WEBHOOK] Error parsing JSON:', e.message)
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const bodyStr = JSON.stringify(body);
    console.log('[ASAAS_WEBHOOK] Full body for debugging:', bodyStr);

    const { event } = body
    const payment = body.payment || body; // Asaas can send payment at root or inside payment object
    
    console.log(`[ASAAS_WEBHOOK] Event: ${event} | Payment ID: ${payment?.id}`)

    const confirmedStatuses = [
      'PAYMENT_RECEIVED',
      'PAYMENT_CONFIRMED',
      'PAYMENT_SETTLED',
      'PAYMENT_RECEIVED_BY_ASAAS',
      'PAYMENT_AUTHORIZED',
      'CHECKOUT_PAID'
    ];

    const isConfirmedEvent = confirmedStatuses.includes(event);
    
    // Resilient externalReference extraction
    let bookingId = null;

    // 1. Check direct paths
    if (payment?.externalReference) bookingId = payment.externalReference;
    else if (body.externalReference) bookingId = body.externalReference;
    
    // 2. If not found, try to find a UUID in the body
    if (!bookingId) {
      const uuidMatch = bodyStr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) {
        bookingId = uuidMatch[0];
        console.log(`[ASAAS_WEBHOOK] Found UUID in body via regex: ${bookingId}`);
      }
    }

    console.log(`[ASAAS_WEBHOOK] Is confirmed: ${isConfirmedEvent} | Booking ID: ${bookingId}`)

    if (bookingId) {
      if (isConfirmedEvent) {
        console.log(`[ASAAS_WEBHOOK] Processing confirmation for booking ${bookingId}`);

        const updateData = { 
          booking_status: 'confirmed',
          payment_status: 'confirmed',
          updated_at: new Date().toISOString()
        };

        const [bookingUpdate, paymentUpdate] = await Promise.all([
          supabaseClient.from('bookings').update(updateData).eq('id', bookingId),
          supabaseClient.from('booking_payments').update({ 
            status: 'paid', 
            updated_at: new Date().toISOString() 
          }).eq('booking_id', bookingId)
        ]);

        if (bookingUpdate.error) console.error('[ASAAS_WEBHOOK] Bookings update error:', bookingUpdate.error);
        if (paymentUpdate.error) console.error('[ASAAS_WEBHOOK] Booking_payments update error:', paymentUpdate.error);
        
        console.log(`[ASAAS_WEBHOOK] Update attempt finished for ${bookingId}`);
      } else {
        // Even if not a confirmed event, we check if the payment is ALREADY paid in Asaas
        // to handle cases where we might have missed the actual confirmation event
        const confirmedAsaasStatuses = ['RECEIVED', 'CONFIRMED', 'RECEIVED_BY_ASAAS', 'SETTLED'];
        const asaasStatus = payment?.status || body.status;
        
        if (confirmedAsaasStatuses.includes(asaasStatus)) {
          console.log(`[ASAAS_WEBHOOK] Detected confirmed status ${asaasStatus} for ${bookingId} even if event was ${event}`);
          
          await Promise.all([
            supabaseClient.from('bookings').update({ 
              booking_status: 'confirmed', 
              payment_status: 'confirmed',
              updated_at: new Date().toISOString()
            }).eq('id', bookingId),
            supabaseClient.from('booking_payments').update({ 
              status: 'paid', 
              updated_at: new Date().toISOString() 
            }).eq('booking_id', bookingId)
          ]);
        } else {
          console.log(`[ASAAS_WEBHOOK] Event ${event} (Status: ${asaasStatus}) ignored for ${bookingId}.`);
        }
      }
    } else {
      console.log(`[ASAAS_WEBHOOK] Could not identify booking from webhook body.`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[ASAAS_WEBHOOK] Fatal error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
