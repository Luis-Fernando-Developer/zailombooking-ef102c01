import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }


  console.log(`Method: ${req.method}, URL: ${req.url}`)
  
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

    const body = await req.json().catch(() => ({}))
    console.log('Request body:', JSON.stringify(body))
    if (!companyId || !serviceId || !employeeId || !date) {
      companyId = companyId || body.company_id || body.companyId
      serviceId = serviceId || body.service_id || body.serviceId
      employeeId = employeeId || body.employee_id || body.employeeId
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
      .maybeSingle()

    if (serviceError || !service) {
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

    let startTime: string
    let endTime: string
    let breakStart: string | null = null
    let breakEnd: string | null = null

    if (specificAvail) {
      // Use specific availability if found
      startTime = specificAvail.start_time
      endTime = specificAvail.end_time
      breakStart = specificAvail.break_start
      breakEnd = specificAvail.break_end
    } else {
      // 3. Get business hours for the day (fallback)
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

      // 4. Get employee schedule (fallback)
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

      // Determine working interval (intersection of business hours and employee schedule)
      startTime = empSchedule.start_time > bizHours.open_time ? empSchedule.start_time : bizHours.open_time
      endTime = empSchedule.end_time < bizHours.close_time ? empSchedule.end_time : bizHours.close_time
    }

    // 4. Get existing bookings
    const { data: bookings, error: bookingsError } = await supabaseClient
      .from('bookings')
      .select('start_time, end_time')
      .eq('employee_id', employeeId)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`)
      .not('status', 'eq', 'cancelled')

    // 5. Get blocked slots
    const { data: blocked, error: blockedError } = await supabaseClient
      .from('blocked_slots')
      .select('start_time, end_time')
      .eq('employee_id', employeeId)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`)

    // 6. Generate slots
    const slots = []
    let current = new Date(`${date}T${startTime}`)
    const end = new Date(`${date}T${endTime}`)

    // If it's today, filter out past slots
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    while (current.getTime() + duration * 60000 <= end.getTime()) {
      const slotStart = current.toISOString()
      const slotEnd = new Date(current.getTime() + duration * 60000).toISOString()
      const currentFormatted = current.toTimeString().substring(0, 5)

      // Check if slot is in the past
      if (date === today && current.getTime() <= now.getTime()) {
        current = new Date(current.getTime() + 30 * 60000)
        continue
      }

      // Check if slot is during a break
      if (breakStart && breakEnd) {
        const slotStartTime = currentFormatted;
        const slotEndTime = new Date(current.getTime() + duration * 60000).toTimeString().substring(0, 5);
        
        // A slot overlaps with break if:
        // (slotStart < breakEnd) AND (slotEnd > breakStart)
        if (slotStartTime < breakEnd && slotEndTime > breakStart) {
          current = new Date(current.getTime() + 30 * 60000);
          continue;
        }
      }

      const isBooked = bookings?.some(b => {
        const bStart = new Date(b.start_time).toISOString()
        const bEnd = new Date(b.end_time).toISOString()
        return (slotStart < bEnd && slotEnd > bStart)
      })

      const isBlocked = blocked?.some(b => {
        const bStart = new Date(b.start_time).toISOString()
        const bEnd = new Date(b.end_time).toISOString()
        return (slotStart < bEnd && slotEnd > bStart)
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

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
