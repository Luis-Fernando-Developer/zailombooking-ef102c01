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

    const { event, payment } = body
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
    
    // We try to find the booking ID from externalReference in different locations
    let bookingId = payment?.externalReference || body.payment?.externalReference || body.externalReference;

    // If still not found, try searching in payment object if it's nested differently
    if (!bookingId && body.payment) {
      bookingId = body.payment.externalReference;
    }

    console.log(`[ASAAS_WEBHOOK] Is confirmed: ${isConfirmedEvent} | Booking ID: ${bookingId}`)

    if (bookingId) {
      if (isConfirmedEvent) {
        console.log(`[ASAAS_WEBHOOK] Updating booking ${bookingId} to confirmed due to event ${event}`)

        // Update bookings table
        const { error: bookingError } = await supabaseClient
          .from('bookings')
          .update({ 
            booking_status: 'confirmed',
            payment_status: 'confirmed'
          })
          .eq('id', bookingId)
        
        if (bookingError) {
          console.error('[ASAAS_WEBHOOK] Error updating booking:', bookingError)
        }

        // Update booking_payments table
        const { error: paymentError } = await supabaseClient
          .from('booking_payments')
          .update({ 
            status: 'paid',
            updated_at: new Date().toISOString()
          })
          .eq('booking_id', bookingId)
        
        if (paymentError) {
          console.error('[ASAAS_WEBHOOK] Error updating booking_payment:', paymentError)
        }
        console.log(`[ASAAS_WEBHOOK] Success processing event ${event} for booking ${bookingId}`)
      } else {
        console.log(`[ASAAS_WEBHOOK] Event ${event} received for booking ${bookingId} but not a confirmation event.`)
      }
    } else {
      console.log(`[ASAAS_WEBHOOK] No bookingId found in webhook body. Event: ${event}`)
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
