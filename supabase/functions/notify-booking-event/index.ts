// ============================================================================
// notify-booking-event
// Envia notificação WhatsApp para o cliente conforme evento do agendamento:
//   booking_created | booking_pending | booking_confirmed |
//   booking_cancelled | booking_completed | booking_no_show
//
// Chamado pelo frontend (cliente e painel admin). Best-effort: nunca quebra
// o fluxo principal. Toda a lógica de canal (Flow/Direct) é resolvida pelo
// helper sendWhatsApp (inlined, pois o deploy via Dashboard não empacota
// pastas _shared).
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WA_BASE = (Deno.env.get("WA_SERVICE_BASE_URL") ?? "https://wa.zailom.com").replace(/\/$/, "");

// -------- WhatsApp helpers (inlined) ---------------------------------------
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

// -------- Handler ----------------------------------------------------------
const ALLOWED_EVENTS = new Set([
  "booking_created",
  "booking_pending",
  "booking_confirmed",
  "booking_cancelled",
  "booking_completed",
  "booking_no_show",
]);

function defaultMessage(eventKey: string, vars: Record<string, string>): string {
  const line = `📋 Serviço: ${vars.service_name}\n👤 Profissional: ${vars.employee_name}\n📅 Data: ${vars.date}\n⏰ Horário: ${vars.time}`;
  switch (eventKey) {
    case "booking_pending":
      return `⏳ Olá ${vars.client_name}! Recebemos sua solicitação em *${vars.company_name}*. O agendamento está *pendente* de confirmação.\n\n${line}`;
    case "booking_confirmed":
      return `✅ Olá ${vars.client_name}! Seu agendamento em *${vars.company_name}* foi *confirmado*.\n\n${line}`;
    case "booking_cancelled":
      return `❌ Olá ${vars.client_name}, seu agendamento em *${vars.company_name}* foi *cancelado*.\n\n${line}`;
    case "booking_completed":
      return `🎉 Olá ${vars.client_name}! Seu atendimento em *${vars.company_name}* foi concluído. Obrigado pela preferência!\n\n${line}`;
    case "booking_no_show":
      return `⚠️ Olá ${vars.client_name}, registramos que você não compareceu ao agendamento em *${vars.company_name}*.\n\n${line}`;
    case "booking_created":
    default:
      return `✅ Olá ${vars.client_name}! Seu agendamento em *${vars.company_name}* foi registrado.\n\n${line}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { booking_id, event_key } = await req.json();
    if (!booking_id || !event_key || !ALLOWED_EVENTS.has(event_key)) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: bk, error: bkErr } = await supabase
      .from("bookings")
      .select(`
        id, company_id, booking_date, booking_time,
        client:clients(name, phone),
        company:companies(name),
        service:services(name),
        employee:employees(name)
      `)
      .eq("id", booking_id)
      .maybeSingle();

    if (bkErr || !bk) {
      return new Response(JSON.stringify({ error: "booking_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const c: any = bk;
    const phone = c.client?.phone;
    if (!phone) {
      return new Response(JSON.stringify({ ok: false, skipped: "no_client_phone" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dateStr = String(c.booking_date ?? "");
    const [y, m, d] = dateStr.split("-");
    const dateBR = y && m && d ? `${d}/${m}/${y}` : dateStr;
    const timeStr = String(c.booking_time ?? "").slice(0, 5);

    const vars = {
      client_name: c.client?.name ?? "",
      company_name: c.company?.name ?? "",
      service_name: c.service?.name ?? "",
      employee_name: c.employee?.name ?? "",
      date: dateBR,
      time: timeStr,
    };

    const tpl = await loadWhatsAppTemplate(supabase, c.company_id, event_key);
    const text = tpl ? renderTemplate(tpl, vars) : defaultMessage(event_key, vars);
    const wa = await sendWhatsApp(supabase, c.company_id, phone, text);

    return new Response(JSON.stringify({ ok: true, event_key, whatsapp: wa }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[notify-booking-event] error:", e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
