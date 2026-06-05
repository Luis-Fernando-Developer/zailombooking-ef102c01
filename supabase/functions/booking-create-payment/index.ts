import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { booking_id, method, payer } = await req.json()

    // 1. Get booking and company settings
    const { data: booking, error: bErr } = await supabaseClient
      .from('bookings')
      .select('*, company:companies(*)')
      .eq('id', booking_id)
      .single()

    if (bErr || !booking) throw new Error('Booking not found')

    const { data: settings, error: sErr } = await supabaseClient
      .from('company_payment_settings')
      .select('*')
      .eq('company_id', booking.company_id)
      .single()

    if (sErr || !settings) throw new Error('Payment settings not found')

    // 2. Decrypt API Key (Assuming the RPC exists or you handle it here)
    // For simplicity in this mock, we assume the key is saved or you use a secret
    // In a real scenario, you'd decrypt it using the p_secret "asaas-own-gateway"
    const { data: decryptedKey, error: decErr } = await supabaseClient.rpc('decrypt_chatbot_key', {
      p_encrypted: settings.own_gateway_api_key_encrypted,
      p_secret: "asaas-own-gateway"
    })

    if (decErr || !decryptedKey) throw new Error('Could not decrypt API Key')

    // 3. Create payment in Asaas
    if (settings.own_gateway_provider === 'asaas') {
      const asaasPayload = {
        customer: '', // You might need to create/find a customer first
        billingType: method === 'PIX' ? 'PIX' : method,
        value: booking.total_price,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        description: `Agendamento #${booking.id}`,
        externalReference: booking.id,
      }

      // This is a simplified flow. Real world requires customer management.
      // ... Asaas API calls ...
    }

    return new Response(JSON.stringify({ message: 'Function scaffolded' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
