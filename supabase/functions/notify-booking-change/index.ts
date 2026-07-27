// Edge Function: notify-booking-change
// Notifica o cliente (e a equipe) quando um agendamento é realocado/reagendado.
// verify_jwt = false (validamos manualmente; aceita chamadas autenticadas do app)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WA_BASE = (Deno.env.get("WA_SERVICE_BASE_URL") ?? "https://wa.zailom.com").replace(/\/$/, "");

const legacyTemplateEventKeys: Record<string, string[]> = {
  booking_pending: ["booking.created"],
  booking_confirmed: ["booking.confirmed", "booking.created"],
  booking_cancelled: ["booking.cancelled"],
  booking_rescheduled: ["booking.rescheduled"],
  booking_reminder: ["booking.reminder"],
};

function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

async function loadWhatsAppTemplate(admin: any, companyId: string, eventKey: string): Promise<string | null> {
  const keys = [eventKey, ...(legacyTemplateEventKeys[eventKey] ?? [])];
  const { data } = await admin.from("whatsapp_templates")
    .select("event_key, template, enabled")
    .eq("company_id", companyId).in("event_key", keys);
  const rows = (data ?? []) as Array<{ event_key: string; template: string; enabled: boolean }>;
  const exact = rows.find((row) => row.event_key === eventKey);
  if (exact) return exact.enabled === false ? null : exact.template;
  const fallback = rows.find((row) => row.enabled !== false);
  return fallback?.template ?? null;
}

async function sendWhatsApp(admin: any, companyId: string, to: string, message: string) {
  const cleanTo = String(to || "").replace(/\D/g, "");
  if (!cleanTo || !message) return { via: "none", ok: false, error: "invalid_input" };

  const { data: limits } = await admin.rpc("whatsapp_get_plan_limits", { p_company: companyId });
  if (limits && limits.messages_allowed === false) {
    return { via: "none", ok: false, error: "message_limit_reached" };
  }

  const { data: channel } = await admin.rpc("resolve_whatsapp_channel", { p_company: companyId });
  if (!channel || channel === "none") return { via: "none", ok: false, error: "channel_disabled" };

  if (channel === "flow") {
    const { data: cb } = await admin.from("chatbot_integration")
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
        to: cleanTo,
        text: message,
      }),
    });
    const respBody = await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; }});
    if (res.ok) await admin.rpc("whatsapp_bump_usage", { p_company: companyId });
    return { via: "flow", ok: res.ok, status: res.status, response: respBody };
  }

  const { data: integRow } = await admin.from("whatsapp_integration")
    .select("wa_api_key").eq("company_id", companyId).maybeSingle();
  const apiKey = integRow?.wa_api_key;
  if (!apiKey) return { via: "direct", ok: false, error: "wa_service_not_provisioned" };

  const { data: inst } = await admin.from("whatsapp_instances")
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
  if (res.ok) await admin.rpc("whatsapp_bump_usage", { p_company: companyId });
  return { via: "direct", ok: res.ok, status: res.status, response: respBody };
}

interface Payload {
  booking_id: string;
  change_type: "reallocation" | "reschedule" | "cancellation";
  reason?: string;
  previous?: Record<string, unknown>;
  current?: Record<string, unknown>;
}

const whatsappEventByChangeType: Record<Payload["change_type"], string> = {
  reallocation: "booking_reallocated",
  reschedule: "booking_rescheduled",
  cancellation: "booking_cancelled",
};

function toDateBR(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw) return "—";
  const datePart = raw.includes("T") ? raw.split("T")[0] : raw;
  const [year, month, day] = datePart.split("-");
  return year && month && day ? `${day}/${month}/${year}` : raw;
}

function toHHMM(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw) return "—";
  const iso = raw.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const time = raw.match(/^(\d{2}):(\d{2})/);
  if (time) return `${time[1]}:${time[2]}`;
  return raw.slice(0, 5);
}

async function nameById(admin: ReturnType<typeof createClient>, table: string, id: unknown): Promise<string | null> {
  if (!id) return null;
  const { data } = await admin.from(table).select("name").eq("id", id).maybeSingle();
  return (data?.name as string | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = (await req.json()) as Payload;
    if (!body?.booking_id || !body?.change_type) {
      return json({ error: "missing_fields" }, 400);
    }

    const { data: bk, error: bkErr } = await admin
      .from("bookings")
      .select(`
        id, company_id, client_id, employee_id, service_id,
        booking_date, start_time,
        client:clients(id, name, phone, user_id),
        employee:employees(id, name),
        service:services(id, name),
        company:companies(id, name, slug)
      `)
      .eq("id", body.booking_id)
      .maybeSingle();

    if (bkErr || !bk) return json({ error: "booking_not_found" }, 404);

    const c: any = bk;
    let previous = body.previous ?? null;
    let current = body.current ?? null;

    if (!previous || !current) {
      const historyType = body.change_type === "reschedule"
        ? "reschedule"
        : body.change_type === "cancellation"
          ? "cancel"
          : "reallocation";
      const { data: hist } = await admin
        .from("booking_history")
        .select("old_data,new_data,change_type,created_at")
        .eq("booking_id", body.booking_id)
        .eq("change_type", historyType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      previous = previous ?? (hist?.old_data as Record<string, unknown> | null) ?? null;
      current = current ?? (hist?.new_data as Record<string, unknown> | null) ?? null;
    }

    const previousBooking = previous ?? c;
    const currentBooking = current ?? c;

    const serviceName =
      (currentBooking as any)?.service?.name ??
      (previousBooking as any)?.service?.name ??
      c.service?.name ??
      (await nameById(admin, "services", (currentBooking as any)?.service_id ?? c.service_id)) ??
      "Serviço";
    const previousEmployeeName =
      (previousBooking as any)?.employee?.name ??
      (await nameById(admin, "employees", (previousBooking as any)?.employee_id)) ??
      c.employee?.name ??
      "Profissional anterior";
    const currentEmployeeName =
      (currentBooking as any)?.employee?.name ??
      c.employee?.name ??
      (await nameById(admin, "employees", (currentBooking as any)?.employee_id ?? c.employee_id)) ??
      "Novo profissional";

    const previousDate = toDateBR((previousBooking as any)?.booking_date ?? c.booking_date);
    const previousTime = toHHMM((previousBooking as any)?.start_time ?? c.start_time);
    const currentDate = toDateBR((currentBooking as any)?.booking_date ?? c.booking_date);
    const currentTime = toHHMM((currentBooking as any)?.start_time ?? c.start_time);

    const titleByType: Record<string, string> = {
      reallocation: "Um agendamento foi realocado",
      reschedule:   "Um agendamento foi reagendado pelo cliente",
      cancellation: "Um agendamento foi cancelado",
    };
    const title = titleByType[body.change_type] ?? "Atualização no seu agendamento";
    const clientName = c.client?.name ?? "Cliente";
    const previousServiceName =
      (previousBooking as any)?.service?.name ??
      (await nameById(admin, "services", (previousBooking as any)?.service_id)) ??
      serviceName;
    const message = body.change_type === "cancellation"
      ? `Agendamento cancelado: ${serviceName} — ${currentEmployeeName} — ${currentDate} às ${currentTime}.` +
        (body.reason ? ` Motivo: ${body.reason}` : "")
      : body.change_type === "reschedule"
        ? `Usuário ${clientName} reagendou serviço "${previousServiceName}", ${previousDate} ${previousTime} com profissional ${previousEmployeeName} ` +
          `para "${serviceName}", ${currentDate} ${currentTime} com profissional ${currentEmployeeName}.` +
          (body.reason ? ` Motivo: ${body.reason}` : "")
        : `Atual: ${serviceName} — ${previousEmployeeName} — ${previousDate} às ${previousTime}.\n` +
          `Realocado para: ${serviceName} — ${currentEmployeeName} — ${currentDate} às ${currentTime}.` +
          (body.reason ? ` Motivo: ${body.reason}` : "");

    // 1) Notificação in-app (sino do cliente / sino da empresa usam company_notifications)
    const { error: notifErr } = await admin.from("company_notifications").insert({
      company_id: c.company_id,
      type: `booking_${body.change_type}`,
      title,
      message,
      link: `/admin/agendamentos?bookingId=${c.id}`,
      metadata: {
        booking_id: c.id,
        client_user_id: c.client?.user_id ?? null,
        client_name: c.client?.name ?? null,
        employee_id: c.employee_id,
        change_type: body.change_type,
        reason: body.reason ?? null,
        previous: previousBooking,
        current: currentBooking,
      },
    });
    if (notifErr) {
      console.error("notif insert error:", notifErr);
      return json({ ok: false, error: notifErr.message, details: notifErr }, 500);
    }

    // 2) Mensagem direta no chat (caso o cliente esteja logado)
    if (c.client?.user_id) {
      await admin.from("chat_messages").insert({
        company_id: c.company_id,
        channel_type: "direct",
        sender_user_id: null,
        recipient_user_id: c.client.user_id,
        content: `🔔 ${title.replace("Um agendamento", "Seu agendamento")}\n${message}`,
        metadata: { booking_id: c.id, system: true, change_type: body.change_type },
      }).then(({ error }) => error && console.error("chat insert error:", error));
    }

    // 3) Notificação WhatsApp (Flow ou Evolution direta) — best-effort
    try {
      const clientPhone: string | null = c.client?.phone ?? null;
      if (clientPhone) {
        const eventKey = whatsappEventByChangeType[body.change_type];
        const tpl = await loadWhatsAppTemplate(admin, c.company_id, eventKey);
        const vars = {
          client_name: c.client?.name ?? "",
          company_name: c.company?.name ?? "",
          service_name: serviceName,
          employee_name: currentEmployeeName,
          previous_employee_name: previousEmployeeName,
          previous_date: previousDate,
          previous_time: previousTime,
          date: currentDate,
          time: currentTime,
          reason: body.reason ?? "",
        };
        const text = tpl ? renderTemplate(tpl, vars) : `${title}\n${message}`;
        const wa = await sendWhatsApp(admin, c.company_id, clientPhone, text);
        console.log("[notify-booking-change] whatsapp:", wa);
      }
    } catch (waErr) {
      console.error("[notify-booking-change] whatsapp error (ignored):", waErr);
    }

    return json({ ok: true });

  } catch (e: any) {
    console.error("notify-booking-change failed:", e);
    return json({ error: e?.message || "internal_error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
