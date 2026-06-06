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

    const { event, payment: bodyPayment } = body
    const payment = bodyPayment || body; // Asaas can send payment at root or inside payment object
    
    const currentStatus = (payment?.status || body.status || '').toUpperCase();
    console.log(`[ASAAS_WEBHOOK] Event: ${event} | Payment ID: ${payment?.id} | Status: ${currentStatus}`)

    const confirmedStatuses = [
      'PAYMENT_RECEIVED',
      'PAYMENT_CONFIRMED',
      'PAYMENT_SETTLED',
      'PAYMENT_RECEIVED_BY_ASAAS',
      'PAYMENT_AUTHORIZED',
      'CHECKOUT_PAID'
    ];

    const confirmedAsaasStatuses = ['RECEIVED', 'CONFIRMED', 'RECEIVED_BY_ASAAS', 'SETTLED'];
    
    // Check if it's ANY event that indicates payment success
    const isConfirmed = confirmedStatuses.includes(event) || 
                        confirmedAsaasStatuses.includes(currentStatus) || 
                        (event && (event.includes('RECEIVED') || event.includes('CONFIRMED') || event.includes('AUTHORIZED')));
    
    // Resilient extraction of booking ID (externalReference)
    let bookingId = null;

    // 1. Check direct paths in order of reliability
    if (payment?.externalReference) {
      bookingId = payment.externalReference;
    } else if (body.externalReference) {
      bookingId = body.externalReference;
    } else if (payment?.description && payment.description.includes('Agendamento #')) {
      const parts = payment.description.split('#');
      if (parts[1]) bookingId = parts[1].trim();
      console.log(`[ASAAS_WEBHOOK] Extracted bookingId from description: ${bookingId}`);
    }
    
    // 2. Fallback: Check nested externalReference
    if (!bookingId && payment?.payment?.externalReference) {
      bookingId = payment.payment.externalReference;
    }

    // 3. Last resort: Try to find a UUID in the body
    if (!bookingId) {
      const uuidMatch = bodyStr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) {
        bookingId = uuidMatch[0];
        console.log(`[ASAAS_WEBHOOK] Found UUID in body via regex: ${bookingId}`);
      }
    }

    console.log(`[ASAAS_WEBHOOK] Is confirmed: ${isConfirmed} | Booking ID: ${bookingId}`)

    if (bookingId) {
      // Find the booking to ensure it exists and get company_id for Realtime
      const { data: bookingData, error: checkErr } = await supabaseClient
        .from('bookings')
        .select('id, company_id, booking_status, payment_status')
        .eq('id', bookingId)
        .maybeSingle();
      
      if (checkErr) console.error('[ASAAS_WEBHOOK] Error checking booking:', checkErr);
      
      if (!bookingData) {
        console.error(`[ASAAS_WEBHOOK] Booking ${bookingId} not found in database.`);
      } else {
        console.log(`[ASAAS_WEBHOOK] Booking found. Current status: ${bookingData.booking_status}/${bookingData.payment_status}`);

        // Update booking and payment row
        if (isConfirmed) {
          console.log(`[ASAAS_WEBHOOK] Processing confirmation for booking ${bookingId}`);

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
            .update({ 
              status: 'paid', 
              updated_at: now
            })
            .eq('booking_id', bookingId);

          if (bErr) console.error('[ASAAS_WEBHOOK] Bookings update error:', bErr);
          if (pErr) console.error('[ASAAS_WEBHOOK] Booking_payments update error:', pErr);
          
          console.log(`[ASAAS_WEBHOOK] Success updates completed for ${bookingId}`);
        } else {
          console.log(`[ASAAS_WEBHOOK] Event ${event} / Status ${currentStatus} is not a confirmation event. Ignoring.`);
        }
      }
    } else {
      console.error(`[ASAAS_WEBHOOK] CRITICAL: Could not identify booking from webhook body. Body snippet: ${bodyStr.substring(0, 500)}`);
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
