import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const normalizeTime = (value: string | null | undefined): string | null => {
  if (!value) return null
  const rawValue = String(value).trim()
  const loosePlainTimeMatch = rawValue.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (loosePlainTimeMatch?.[1] && loosePlainTimeMatch?.[2]) {
    const hour = Number(loosePlainTimeMatch[1])
    const minute = Number(loosePlainTimeMatch[2])
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${loosePlainTimeMatch[2]}`
    }
  }
  const zonedIsoTimeMatch = rawValue.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/)
  if (zonedIsoTimeMatch) {
    const parsedDate = new Date(rawValue)
    if (!Number.isNaN(parsedDate.getTime())) {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
      }).format(parsedDate)
    }
  }
  const isoTimeMatch = rawValue.match(/T(\d{2}:\d{2})(?::\d{2})?/)
  if (isoTimeMatch?.[1]) return isoTimeMatch[1]
  const plainTimeMatch = rawValue.match(/^(\d{2}:\d{2})(?::\d{2})?/)
  return plainTimeMatch?.[1] ?? null
}

const normalizeDate = (value: string | null | undefined): string | null => {
  if (!value) return null
  const rawValue = String(value).trim()
  const isoWithTimeMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  const isoDateMatch = rawValue.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
  const brDateMatch = rawValue.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  const dateMatch = isoWithTimeMatch ?? isoDateMatch

  const normalized = brDateMatch
    ? { year: brDateMatch[3], month: brDateMatch[2], day: brDateMatch[1] }
    : dateMatch
      ? { year: dateMatch[1], month: dateMatch[2], day: dateMatch[3] }
      : null
  if (!normalized) return null

  const parsedDate = new Date(Date.UTC(Number(normalized.year), Number(normalized.month) - 1, Number(normalized.day)))
  if (
    parsedDate.getUTCFullYear() !== Number(normalized.year) ||
    parsedDate.getUTCMonth() !== Number(normalized.month) - 1 ||
    parsedDate.getUTCDate() !== Number(normalized.day)
  ) {
    return null
  }

  return `${normalized.year}-${normalized.month}-${normalized.day}`
}

const slotsContainTime = (
  rows: Array<{ slot: string | null; reason: string | null }> | null | undefined,
  time: string,
) => {
  const slots = (rows ?? [])
    .filter((row) => row.slot)
    .map((row) => String(row.slot).substring(0, 5))

  return {
    available: slots.includes(time),
    slots,
    reason: slots.length === 0 ? rows?.[0]?.reason ?? 'no_slots' : null,
  }
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
      const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
        email: client_email,
        password: client_password || '123456',
        email_confirm: true,
        user_metadata: { name: client_name }
      })

      if (authError) throw authError

      const { error: clientError } = await supabaseClient
        .from('clients')
        .insert({
          id: authData.user.id,
          company_id,
          name: client_name,
          email: client_email,
          phone: client_phone
        })

      if (clientError) throw clientError
      clientId = authData.user.id
    } else {
      const { data: clientData, error: clientError } = await supabaseClient
        .from('clients')
        .select('id')
        .eq('company_id', company_id)
        .eq('email', client_email)
        .maybeSingle()

      if (clientError || !clientData) throw new Error('Cliente não encontrado')
      clientId = clientData.id
    }

    const normalizedBookingDate = normalizeDate(booking_date)
    if (!normalizedBookingDate) throw new Error('Data do agendamento inválida')

    const normalizedBookingTime = normalizeTime(booking_time)
    if (!normalizedBookingTime) throw new Error('Horário do agendamento inválido')

    // Gate único de disponibilidade: mesma fonte usada pelo GET de slots.
    const { data: availabilityRows, error: gateErr } = await supabaseClient.rpc('get_available_slots', {
      p_company: company_id,
      p_employee: employee_id,
      p_service: service_id,
      p_date: normalizedBookingDate,
    })
    if (gateErr) throw gateErr
    const availability = slotsContainTime(
      availabilityRows as Array<{ slot: string | null; reason: string | null }> | null,
      normalizedBookingTime,
    )
    if (!availability.available) {
      throw new Error(`Horário indisponível (${availability.reason ?? 'slot_not_returned_by_get_available_slots'}). Slots disponíveis: ${availability.slots.join(', ') || 'nenhum'}`)
    }


    // bookings.start_time / end_time são timestamptz — precisam ser construídos
    // a partir de booking_date + HH:MM no fuso America/Sao_Paulo (-03:00).
    const startIso = `${normalizedBookingDate}T${normalizedBookingTime}:00-03:00`
    const endIso = new Date(
      new Date(startIso).getTime() + (duration_minutes ?? 30) * 60000
    ).toISOString()

    const { data: bookingData, error: bookingError } = await supabaseClient
      .from('bookings')
      .insert({
        company_id,
        client_id: clientId,
        service_id,
        employee_id,
        booking_date: normalizedBookingDate,
        booking_time: `${normalizedBookingTime}:00`,
        start_time: startIso,
        end_time: endIso,
        duration_minutes,
        price: price,
        booking_status: 'confirmed',
        payment_status: 'confirmed'
      })
      .select()
      .single()

    if (bookingError) throw bookingError

    if (combo_id && combo_items && Array.isArray(combo_items)) {
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
