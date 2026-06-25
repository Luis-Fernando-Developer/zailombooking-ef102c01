import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// =============================================================
// get-availability — proxy fino para a SSOT public.get_available_slots
// Sem fallback legado. Retorna { slots, reason } onde reason explica
// o motivo de não haver disponibilidade quando slots = [].
// =============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    let companyId  = req.headers.get('x-company-id')
    let serviceId  = req.headers.get('x-service-id')
    let employeeId = req.headers.get('x-employee-id')
    let date       = req.headers.get('x-date')

    if (!companyId || !serviceId || !employeeId || !date) {
      const body = await req.json().catch(() => ({}))
      companyId  = companyId  || body.company_id
      serviceId  = serviceId  || body.service_id
      employeeId = employeeId || body.employee_id
      date       = date       || body.date
    }

    if (!companyId || !serviceId || !employeeId || !date) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      })
    }

    const { data, error } = await supabase.rpc('get_available_slots', {
      p_company:  companyId,
      p_employee: employeeId,
      p_service:  serviceId,
      p_date:     date,
    })

    if (error) {
      console.error('[get-availability] RPC error:', error)
      return new Response(JSON.stringify({ slots: [], reason: 'rpc_error', error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    const rows = (data ?? []) as Array<{ slot: string | null; reason: string | null }>
    const slots  = rows.filter(r => r.slot).map(r => String(r.slot).substring(0, 5))
    const reason = slots.length === 0 ? (rows[0]?.reason ?? 'no_slots') : null

    return new Response(JSON.stringify({ slots, reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (err: any) {
    console.error('[get-availability] Error:', err)
    return new Response(JSON.stringify({ slots: [], reason: 'error', error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  }
})
