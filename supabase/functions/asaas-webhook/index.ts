import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { event, payment } = body

    if (event === 'PAYMENT_RECEIVED' && payment.externalReference) {
      const bookingId = payment.externalReference

      // Update booking and create payment record
      await supabaseClient
        .from('bookings')
        .update({ status: 'confirmed' }) // or paid
        .eq('id', bookingId)
      
      await supabaseClient
        .from('booking_payments')
        .upsert({
          booking_id: bookingId,
          status: 'paid',
          amount: payment.value,
          provider_id: payment.id,
          method: payment.billingType
        }, { onConflict: 'booking_id' })
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
