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
    
    console.log(`[ASAAS_WEBHOOK] Event: ${event} | Payment ID: ${payment?.id} | Status: ${payment?.status || body.status}`)

    const confirmedStatuses = [
      'PAYMENT_RECEIVED',
      'PAYMENT_CONFIRMED',
      'PAYMENT_SETTLED',
      'PAYMENT_RECEIVED_BY_ASAAS',
      'PAYMENT_AUTHORIZED',
      'CHECKOUT_PAID'
    ];

    const confirmedAsaasStatuses = ['RECEIVED', 'CONFIRMED', 'RECEIVED_BY_ASAAS', 'SETTLED'];
    const currentStatus = (payment?.status || body.status || '').toUpperCase();

    const isConfirmed = confirmedStatuses.includes(event) || confirmedAsaasStatuses.includes(currentStatus);
    
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

    console.log(`[ASAAS_WEBHOOK] Is confirmed: ${isConfirmed} | Booking ID: ${bookingId}`)

    if (bookingId) {
      if (isConfirmed) {
        console.log(`[ASAAS_WEBHOOK] Processing confirmation for booking ${bookingId}`);

        // Update with full forced refresh data
        const { error: bErr } = await supabaseClient
          .from('bookings')
          .update({ 
            booking_status: 'confirmed',
            payment_status: 'confirmed',
            updated_at: new Date().toISOString()
          })
          .eq('id', bookingId);

        const { error: pErr } = await supabaseClient
          .from('booking_payments')
          .update({ 
            status: 'paid', 
            updated_at: new Date().toISOString() 
          })
          .eq('booking_id', bookingId);

        if (bErr) console.error('[ASAAS_WEBHOOK] Bookings update error:', bErr);
        if (pErr) console.error('[ASAAS_WEBHOOK] Booking_payments update error:', pErr);
        
        console.log(`[ASAAS_WEBHOOK] Updates completed for ${bookingId}`);
      } else {
        console.log(`[ASAAS_WEBHOOK] Event ${event} / Status ${currentStatus} not considered confirmation for ${bookingId}.`);
      }
    } else {
      console.error(`[ASAAS_WEBHOOK] CRITICAL: Could not identify booking from webhook body. Body snippet: ${bodyStr.substring(0, 200)}`);
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
