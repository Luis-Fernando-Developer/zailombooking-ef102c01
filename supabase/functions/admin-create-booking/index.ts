import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// WhatsApp helpers (inlined from _shared/notify-whatsapp.ts porque o deploy
// via Supabase Dashboard não empacota pastas irmãs).
// ============================================================================
const WA_BASE = (Deno.env.get("WA_SERVICE_BASE_URL") ?? "https://wa.zailom.com").replace(/\/$/, "");

function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

async function loadWhatsAppTemplate(supabase: any, companyId: string, eventKey: string): Promise<string | null> {
  const { data } = await supabase.from("whatsapp_templates")
    .select("template, enabled")
    .eq("company_id", companyId).eq("event_key", eventKey).maybeSingle();
  if (!data || data.enabled === false) return null;
  return data.template as string;
}

async function sendWhatsApp(supabase: any, companyId: string, to: string, message: string) {
  const cleanTo = String(to || "").replace(/\D/g, "");
  if (!cleanTo || !message) return { via: "none", ok: false, error: "invalid_input" };

  const { data: limits } = await supabase.rpc("whatsapp_get_plan_limits", { p_company: companyId });
  if (limits && limits.messages_allowed === false) {
    return { via: "none", ok: false, error: "message_limit_reached" };
  }

  const { data: channel } = await supabase.rpc("resolve_whatsapp_channel", { p_company: companyId });
  if (!channel || channel === "none") return { via: "none", ok: false, error: "channel_disabled" };

  if (channel === "flow") {
    const { data: cb } = await supabase.from("chatbot_integration")
      .select("flow_api_key, flow_api_base_url, flow_selected_instance_name, flow_default_bot_id")
      .eq("company_id", companyId).maybeSingle();
    if (!cb?.flow_api_key) return { via: "flow", ok: false, error: "flow_not_configured" };
    const base = (cb.flow_api_base_url || "https://api-flowbuilder.zailom.com/functions/v1/flow-api").replace(/\/$/, "");
    const res = await fetch(`${base}/v1/messages/send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cb.flow_api_key}`,
        "x-flow-api-key": cb.flow_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instance: cb.flow_selected_instance_name,
        bot_id: cb.flow_default_bot_id,
        to: cleanTo, text: message,
      }),
    });
    const respBody = await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; }});
    if (res.ok) await supabase.rpc("whatsapp_bump_usage", { p_company: companyId });
    return { via: "flow", ok: res.ok, status: res.status, response: respBody };
  }

  const { data: integRow } = await supabase.from("whatsapp_integration")
    .select("wa_api_key").eq("company_id", companyId).maybeSingle();
  const apiKey = integRow?.wa_api_key;
  if (!apiKey) return { via: "direct", ok: false, error: "wa_service_not_provisioned" };

  const { data: inst } = await supabase.from("whatsapp_instances")
    .select("wa_instance_id, channel_preference")
    .eq("company_id", companyId).eq("status", "connected")
    .order("is_default", { ascending: false }).limit(1).maybeSingle();
  if (!inst?.wa_instance_id) return { via: "direct", ok: false, error: "no_connected_instance" };

  const instPref = inst.channel_preference ?? "auto";
  if (instPref === "disabled" || instPref === "flow_only") {
    return { via: "direct", ok: false, error: "instance_channel_disabled" };
  }

  const res = await fetch(`${WA_BASE}/v1/instances/${inst.wa_instance_id}/message/sendText`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ number: cleanTo, text: message }),
  });
  const respBody = await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; }});
  if (res.ok) await supabase.rpc("whatsapp_bump_usage", { p_company: companyId });
  return { via: "direct", ok: res.ok, status: res.status, response: respBody };
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
  const isoTimeMatch = rawValue.match(/T(\d{2}:\d{2})(?::\d{2})?/)
  if (isoTimeMatch?.[1]) return isoTimeMatch[1]
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
      is_new_client,
      payment_status: payment_status_input,
      booking_status: booking_status_input,
    } = body

    const allowedPaymentStatuses = ['pending', 'confirmed', 'paid', 'refunded', 'failed']
    const allowedBookingStatuses = ['pending', 'confirmed', 'cancelled', 'canceled', 'completed', 'no_show']
    const paymentStatus = allowedPaymentStatuses.includes(String(payment_status_input))
      ? String(payment_status_input)
      : 'pending'
    const bookingStatus = allowedBookingStatuses.includes(String(booking_status_input))
      ? String(booking_status_input)
      : 'confirmed'

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
        booking_status: bookingStatus,
        payment_status: paymentStatus
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

    // WhatsApp notification (best-effort) --------------------------------
    let waDebug: any = { attempted: false }
    try {
      const [{ data: clientRow }, { data: companyRow }, { data: serviceRow }, { data: employeeRow }] = await Promise.all([
        supabaseClient.from('clients').select('name, phone').eq('id', clientId).maybeSingle(),
        supabaseClient.from('companies').select('name').eq('id', company_id).maybeSingle(),
        supabaseClient.from('services').select('name').eq('id', service_id).maybeSingle(),
        supabaseClient.from('employees').select('name').eq('id', employee_id).maybeSingle(),
      ])
      // Fallback: se o cliente já existia mas não tinha telefone salvo, usa o do payload
      let phone = ((clientRow as any)?.phone as string | undefined) || (client_phone as string | undefined)
      if (phone && !((clientRow as any)?.phone) && clientId) {
        // persiste pra próximas notificações
        await supabaseClient.from('clients').update({ phone }).eq('id', clientId)
      }
      waDebug = { attempted: true, phone_found: !!phone, phone_source: (clientRow as any)?.phone ? 'clients_table' : (phone ? 'payload' : 'none') }
      if (phone) {
        const [y, m, d] = normalizedBookingDate.split('-')
        const dateBR = `${d}/${m}/${y}`
        const vars = {
          client_name: (clientRow as any)?.name ?? client_name ?? '',
          company_name: (companyRow as any)?.name ?? '',
          service_name: (serviceRow as any)?.name ?? '',
          employee_name: (employeeRow as any)?.name ?? '',
          date: dateBR,
          time: normalizedBookingTime,
        }
        const tpl = await loadWhatsAppTemplate(supabaseClient as any, company_id, 'booking_created')
        const defaultMsg = `✅ Olá ${vars.client_name}! Seu agendamento em *${vars.company_name}* foi confirmado.\n\n📋 Serviço: ${vars.service_name}\n👤 Profissional: ${vars.employee_name}\n📅 Data: ${dateBR}\n⏰ Horário: ${normalizedBookingTime}`
        const text = tpl ? renderTemplate(tpl, vars) : defaultMsg
        const wa = await sendWhatsApp(supabaseClient as any, company_id, phone, text)
        console.log('[admin-create-booking] whatsapp:', JSON.stringify(wa))
        waDebug = { ...waDebug, template_used: !!tpl, result: wa }
      } else {
        console.warn('[admin-create-booking] cliente sem telefone; whatsapp não enviado. clientId=', clientId)
      }
    } catch (waErr: any) {
      console.error('[admin-create-booking] whatsapp error (ignored):', waErr?.message ?? waErr)
      waDebug = { ...waDebug, error: waErr?.message ?? String(waErr) }
    }


    return new Response(JSON.stringify({ success: true, booking: bookingData, whatsapp: waDebug }), {
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
