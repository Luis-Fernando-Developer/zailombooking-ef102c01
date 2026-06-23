import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

const normalizeTime = (value: string | null | undefined): string | null => {
  if (!value) return null

  const rawValue = String(value).trim()
  const isoTimeMatch = rawValue.match(/T(\d{2}:\d{2})(?::\d{2})?/)
  if (isoTimeMatch?.[1]) return isoTimeMatch[1]

  const plainTimeMatch = rawValue.match(/^(\d{2}:\d{2})(?::\d{2})?/)
  if (plainTimeMatch?.[1]) return plainTimeMatch[1]

  const fallbackDate = new Date(rawValue)
  if (!Number.isNaN(fallbackDate.getTime())) {
    return fallbackDate.toTimeString().substring(0, 5)
  }

  return null
}

const toLocalDateTime = (date: string, time: string): number => {
  return new Date(`${date}T${time}:00`).getTime()
}

const normalizeStatus = (value: string | null | undefined): string => {
  return String(value ?? '').toLowerCase().trim()
}

const bookingOccupiesSlot = (bookingStatus: string | null | undefined, paymentStatus: string | null | undefined): boolean => {
  const booking = normalizeStatus(bookingStatus)
  const payment = normalizeStatus(paymentStatus)
  const releasedBookingStatuses = new Set(['cancelled', 'canceled', 'rejected', 'no_show'])
  const paidPaymentStatuses = new Set(['paid', 'confirmed', 'received', 'pago', 'confirmado', 'success', 'settled', 'authorized', 'deposited', 'done'])

  if (releasedBookingStatuses.has(booking)) return false
  return booking !== '' || paidPaymentStatuses.has(payment)
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200, 
      headers: corsHeaders 
    })
  }


  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Get parameters from headers or body
    let companyId = req.headers.get('x-company-id')
    let serviceId = req.headers.get('x-service-id')
    let employeeId = req.headers.get('x-employee-id')
    let date = req.headers.get('x-date')

    if (!companyId || !serviceId || !employeeId || !date) {
      const body = await req.json().catch(() => ({}))
      companyId = companyId || body.company_id
      serviceId = serviceId || body.service_id
      employeeId = employeeId || body.employee_id
      date = date || body.date
    }

    console.log(`Checking availability for: Company ${companyId}, Service ${serviceId}, Employee ${employeeId}, Date ${date}`)

    if (!companyId || !serviceId || !employeeId || !date) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 1. Get service duration
    const { data: service, error: serviceError } = await supabaseClient
      .from('services')
      .select('duration_minutes')
      .eq('id', serviceId)
      .single()

    if (serviceError || !service) {
      console.error('Service not found:', serviceError)
      return new Response(JSON.stringify({ error: 'Service not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const duration = service.duration_minutes || 30 // default 30 mins

    // 2. Check for specific employee availability on this date
    const { data: specificAvail, error: availError } = await supabaseClient
      .from('employee_availability')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('available_date', date)
      .maybeSingle()

    let startTime: string;
    let endTime: string;
    let breakStart: string | null = null;
    let breakEnd: string | null = null;

    // 2.1 PREFERÊNCIA: escala aprovada (schedule_entries) para esta data específica
    const { data: scheduleEntry } = await supabaseClient
      .from('schedule_entries')
      .select('entry_type, start_time, end_time, break_start, break_end, decision_status, schedule:schedules!inner(status, tenant_id)')
      .eq('employee_id', employeeId)
      .eq('entry_date', date)
      .eq('decision_status', 'approved')
      .in('schedule.status', ['approved', 'partially_approved'])
      .eq('schedule.tenant_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 2.2 Verificar se existe QUALQUER escala aprovada do colaborador cobrindo esta data
    // (Mesmo sem entry específica: dia fora da escala = não disponível)
    const { data: coveringSchedule } = await supabaseClient
      .from('schedules')
      .select('id')
      .eq('tenant_id', companyId)
      .in('status', ['approved', 'partially_approved'])
      .lte('period_start', date)
      .gte('period_end', date)
      .limit(1)
      .maybeSingle()

    if (scheduleEntry) {
      // Se a escala marca como não-trabalho (F/A/FE/D), sem slots
      if (scheduleEntry.entry_type !== 'T' || !scheduleEntry.start_time || !scheduleEntry.end_time) {
        return new Response(JSON.stringify({ slots: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
      startTime = scheduleEntry.start_time
      endTime = scheduleEntry.end_time
      breakStart = scheduleEntry.break_start
      breakEnd = scheduleEntry.break_end
    } else if (specificAvail) {
      // Disponibilidade pontual (autônomos)
      startTime = specificAvail.start_time
      endTime = specificAvail.end_time
      breakStart = specificAvail.break_start
      breakEnd = specificAvail.break_end
    } else if (coveringSchedule) {
      // Existe escala aprovada cobrindo o período, mas SEM entry para este colaborador nesta data → não disponível
      return new Response(JSON.stringify({ slots: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } else {
      // Fallback (compat.): empresas sem escala criada usam business_hours + employee_schedules
      const dayOfWeek = new Date(date).getUTCDay()
      const { data: bizHours, error: bizError } = await supabaseClient
        .from('business_hours')
        .select('*')
        .eq('company_id', companyId)
        .eq('day_of_week', dayOfWeek)
        .single()

      if (bizError || !bizHours || bizHours.is_closed) {
        return new Response(JSON.stringify({ slots: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      const { data: empSchedule, error: empSchError } = await supabaseClient
        .from('employee_schedules')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('day_of_week', dayOfWeek)
        .single()

      if (empSchError || !empSchedule || !empSchedule.is_working) {
        return new Response(JSON.stringify({ slots: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      startTime = empSchedule.start_time > bizHours.open_time ? empSchedule.start_time : bizHours.open_time
      endTime = empSchedule.end_time < bizHours.close_time ? empSchedule.end_time : bizHours.close_time
    }

    // 5. Get existing bookings for this employee/date. Status filtering is done in code
    // to avoid PostgREST NULL semantics hiding paid/confirmed rows with empty statuses.
    const { data: bookings, error: bookingsError } = await supabaseClient
      .from('bookings')
      .select('start_time, duration_minutes, booking_status, payment_status')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .eq('booking_date', date)

    if (bookingsError) {
      console.error('Error loading bookings for availability:', bookingsError)
      return new Response(JSON.stringify({ slots: [], error: 'Could not validate existing bookings' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Found ${bookings?.length || 0} active bookings for ${date}:`, JSON.stringify(bookings))


    // 6. Get blocked slots
    const { data: blocked, error: blockedError } = await supabaseClient
      .from('blocked_slots')
      .select('start_time, end_time')
      .eq('employee_id', employeeId)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`)

    // 7. Generate slots
    const slots = []
    let current = new Date(`${date}T${startTime}`)
    const end = new Date(`${date}T${endTime}`)

    // If it's today, filter out past slots
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    while (current.getTime() + duration * 60000 <= end.getTime()) {
      const currentFormatted = current.toTimeString().substring(0, 5)
      const slotStart = new Date(`${date}T${currentFormatted}`).toISOString()
      const slotEnd = new Date(new Date(`${date}T${currentFormatted}`).getTime() + duration * 60000).toISOString()

      // Check if slot is in the past
      if (date === today && current.getTime() <= now.getTime()) {
        current = new Date(current.getTime() + 30 * 60000)
        continue
      }

      // Check if slot is during a break
      if (breakStart && breakEnd) {
        if (currentFormatted >= breakStart && currentFormatted < breakEnd) {
          current = new Date(current.getTime() + 30 * 60000)
          continue
        }

        // Also check if the service would overlap with the break
        const slotEndFormatted = new Date(current.getTime() + (duration - 1) * 60000).toTimeString().substring(0, 5)
        if (slotEndFormatted >= breakStart && slotEndFormatted < breakEnd) {
          current = new Date(current.getTime() + 30 * 60000)
          continue
        }
      }

      const isBooked = bookings?.some(b => {
        if (!bookingOccupiesSlot(b.booking_status, b.payment_status)) return false

        // start_time may be stored either as TIME ("08:00:00") or as a timestamp
        // ("2026-07-01T08:00:00"). Normalize before checking overlap.
        const bStartStr = normalizeTime(b.start_time)
        if (!bStartStr) return false
        const bDur = b.duration_minutes || duration
        const bStart = toLocalDateTime(date, bStartStr)
        const bEnd = bStart + bDur * 60000

        const sStart = toLocalDateTime(date, currentFormatted)
        const sEnd = sStart + duration * 60000

        const overlaps = (sStart < bEnd && sEnd > bStart)
        if (overlaps) {
          console.log(`Slot ${currentFormatted} overlaps booking ${bStartStr} (${bDur}min) status=${b.booking_status}/${b.payment_status}`)
        }
        return overlaps
      })


      const isBlocked = blocked?.some(b => {
        const bStart = new Date(b.start_time).getTime()
        const bEnd = new Date(b.end_time).getTime()
        const sStart = new Date(slotStart).getTime()
        const sEnd = new Date(slotEnd).getTime()
        return (sStart < bEnd && sEnd > bStart)
      })

      if (!isBooked && !isBlocked) {
        slots.push(currentFormatted)
      }

      current = new Date(current.getTime() + 30 * 60000) // Increment by 30 mins
    }

    return new Response(JSON.stringify({ slots }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 even on error to satisfy CORS preflight logic in some environments
    })
  }
})
