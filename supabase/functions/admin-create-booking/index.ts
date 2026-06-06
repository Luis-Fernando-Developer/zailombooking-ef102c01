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

    const body = await req.json()
    console.log('[ADMIN_CREATE_BOOKING] Request body:', body)

    const {
      company_id,
      service_id,
      combo_id,
      combo_items,
      employee_id,
      booking_date,
      booking_time,
      duration_minutes,
      price,
      client_name,
      client_email,
      client_phone,
      client_password,
      is_new_client
    } = body

    let clientId

    if (is_new_client) {
      // Create new client in auth.users and public.clients
      const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
        email: client_email,
        password: client_password || '123456',
        email_confirm: true,
        user_metadata: { name: client_name }
      })

      if (authError) throw authError

      const { data: clientData, error: clientError } = await supabaseClient
        .from('clients')
        .insert({
          id: authData.user.id,
          company_id,
          name: client_name,
          email: client_email,
          phone: client_phone
        })
        .select()
        .single()

      if (clientError) throw clientError
      clientId = authData.user.id
    } else {
      // Find existing client
      const { data: clientData, error: clientError } = await supabaseClient
        .from('clients')
        .select('id')
        .eq('company_id', company_id)
        .eq('email', client_email)
        .single()

      if (clientError || !clientData) throw new Error('Cliente não encontrado')
      clientId = clientData.id
    }

    // Create booking
    const { data: bookingData, error: bookingError } = await supabaseClient
      .from('bookings')
      .insert({
        company_id,
        client_id: clientId,
        service_id,
        employee_id,
        booking_date,
        start_time: booking_time,
        duration_minutes,
        total_price: price,
        booking_status: 'confirmed',
        payment_status: 'confirmed' // Admin created bookings are usually confirmed manually
      })
      .select()
      .single()

    if (bookingError) throw bookingError

    // If combo, create combo items
    if (combo_id && combo_items && Array.isArray(combo_items)) {
       // Note: Depending on your schema, you might need to insert into a junction table
       // For now, let's assume the booking has a combo_id field if it exists
       await supabaseClient
        .from('bookings')
        .update({ combo_id })
        .eq('id', bookingData.id)
    }

    return new Response(JSON.stringify({ success: true, booking: bookingData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('[ADMIN_CREATE_BOOKING] Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
