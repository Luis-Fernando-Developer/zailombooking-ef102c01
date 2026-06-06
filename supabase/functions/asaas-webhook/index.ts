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
        status: 200, // Return 200 even on error to stop Asaas retries
      })
    }

    const event = body.event;
    const payment = body.payment || body; 
    const currentStatus = (payment?.status || body.status || '').toUpperCase();
    
    // Log explicitamente os dados que o Asaas envia
    console.info(`[ASAAS_WEBHOOK] Evento: ${event} | Status Pagamento: ${currentStatus} | ID Asaas: ${payment?.id}`)

    const confirmedEvents = [
      'PAYMENT_RECEIVED', 
      'PAYMENT_CONFIRMED', 
      'PAYMENT_SETTLED', 
      'PAYMENT_RECEIVED_BY_ASAAS', 
      'PAYMENT_AUTHORIZED', 
      'CHECKOUT_PAID'
    ];
    
    const isConfirmed = confirmedEvents.includes(event) || 
                        ['RECEIVED', 'CONFIRMED', 'SETTLED', 'AUTHORIZED'].includes(currentStatus);

    let bookingId = payment?.externalReference || body.externalReference || body.payment?.externalReference;
    
    if (!bookingId && (payment?.description || body.description)?.includes('#')) {
      const desc = payment?.description || body.description;
      const match = desc.match(/#([0-9a-f-]{36})/i);
      if (match) bookingId = match[1];
    }
    
    if (!bookingId) {
      const uuidMatch = rawBody.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) bookingId = uuidMatch[0];
    }

    console.info(`[ASAAS_WEBHOOK] Agendamento ID: ${bookingId} | Confirmado: ${isConfirmed}`)

    if (bookingId) {
      const now = new Date().toISOString();
      
      if (isConfirmed) {
        // Log to a dedicated audit table if it exists, or just log to console
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
      }
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


