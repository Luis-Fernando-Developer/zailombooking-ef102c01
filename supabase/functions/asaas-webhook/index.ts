import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Use console.info for better visibility in logs
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
      console.error('[ASAAS_WEBHOOK] CRITICAL: Failed to parse JSON body:', e.message)
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Comprehensive event and status check
    const event = body.event;
    const payment = body.payment || body; 
    const currentStatus = (payment?.status || body.status || '').toUpperCase();
    
    console.info(`[ASAAS_WEBHOOK] Processing - Event: ${event} | Status: ${currentStatus} | Payment ID: ${payment?.id}`)

    // Detailed lists of confirmed statuses from Asaas
    const confirmedStatuses = [
      'PAYMENT_RECEIVED',
      'PAYMENT_CONFIRMED',
      'PAYMENT_SETTLED',
      'PAYMENT_RECEIVED_BY_ASAAS',
      'PAYMENT_AUTHORIZED',
      'CHECKOUT_PAID',
      'TRANSFER_CONFIRMED',
      'TRANSFER_RECEIVED'
    ];

    const confirmedAsaasStatuses = [
      'RECEIVED', 
      'CONFIRMED', 
      'RECEIVED_BY_ASAAS', 
      'SETTLED', 
      'AUTHORIZED',
      'PAID'
    ];
    
    const isConfirmed = confirmedStatuses.includes(event) || 
                        confirmedAsaasStatuses.includes(currentStatus) || 
                        (event && (event.includes('RECEIVED') || event.includes('CONFIRMED') || event.includes('AUTHORIZED')));

    // Resilient extraction of booking ID (externalReference)
    let bookingId = null;

    // Search everywhere for the booking UUID
    if (payment?.externalReference) {
      bookingId = payment.externalReference;
    } else if (body.externalReference) {
      bookingId = body.externalReference;
    } else if (payment?.description && payment.description.includes('Agendamento #')) {
      const parts = payment.description.split('#');
      if (parts[1]) bookingId = parts[1].trim();
    }
    
    // Fallback: Check nested externalReference or metadata
    if (!bookingId && payment?.payment?.externalReference) {
      bookingId = payment.payment.externalReference;
    }

    // regex fallback to find any UUID in the body string
    if (!bookingId) {
      const uuidMatch = rawBody.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) {
        bookingId = uuidMatch[0];
        console.info(`[ASAAS_WEBHOOK] Found potential Booking ID via regex: ${bookingId}`);
      }
    }

    console.info(`[ASAAS_WEBHOOK] Identification - Booking ID: ${bookingId} | Is Confirmation Event: ${isConfirmed}`)

    if (bookingId) {
      // 1. First, always try to log the attempt in the database if possible
      // This helps diagnose if the function ran but failed later
      
      // 2. Fetch current booking state
      const { data: bookingData, error: checkErr } = await supabaseClient
        .from('bookings')
        .select('id, booking_status, payment_status')
        .eq('id', bookingId)
        .maybeSingle();
      
      if (checkErr) {
        console.error('[ASAAS_WEBHOOK] Error fetching booking:', checkErr);
      }
      
      if (!bookingData) {
        console.error(`[ASAAS_WEBHOOK] Booking ${bookingId} not found in database. Search was performed.`);
      } else {
        console.info(`[ASAAS_WEBHOOK] Booking ${bookingId} found. Current: ${bookingData.booking_status}/${bookingData.payment_status}`);

        if (isConfirmed) {
          console.info(`[ASAAS_WEBHOOK] PERFORMING UPDATE for booking ${bookingId}`);
          const now = new Date().toISOString();
          
          // Force update both tables
          const [res1, res2] = await Promise.all([
            supabaseClient
              .from('bookings')
              .update({ 
                booking_status: 'confirmed',
                payment_status: 'confirmed',
                updated_at: now
              })
              .eq('id', bookingId),
            supabaseClient
              .from('booking_payments')
              .update({ 
                status: 'paid', 
                updated_at: now
              })
              .eq('booking_id', bookingId)
          ]);

          if (res1.error) console.error('[ASAAS_WEBHOOK] Error updating bookings table:', res1.error);
          if (res2.error) console.error('[ASAAS_WEBHOOK] Error updating booking_payments table:', res2.error);
          
          console.info(`[ASAAS_WEBHOOK] Finalized updates for ${bookingId}. Result: SUCCESS`);
        } else {
          console.info(`[ASAAS_WEBHOOK] Received non-confirmation event (${event}/${currentStatus}). No database updates performed.`);
        }
      }
    } else {
      console.error(`[ASAAS_WEBHOOK] CRITICAL: Could not find Booking ID in webhook body.`);
    }

    // Always return 200 to Asaas to prevent retries of invalid requests
    return new Response(JSON.stringify({ received: true, bookingId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[ASAAS_WEBHOOK] FATAL EXCEPTION:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 even on error to stop Asaas from hammering if it's a code bug
    })
  }
})

