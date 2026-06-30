// Edge Function: notify-booking-change
// Notifica o cliente (e a equipe) quando um agendamento é realocado/reagendado.
// verify_jwt = false (validamos manualmente; aceita chamadas autenticadas do app)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  booking_id: string;
  change_type: "reallocation" | "reschedule" | "cancellation";
  reason?: string;
  previous?: Record<string, unknown>;
  current?: Record<string, unknown>;
}

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
        client:clients(id, name, user_id),
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
      const historyType = body.change_type === "reschedule" ? "reschedule" : "reallocation";
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
      reschedule:   "Um agendamento foi reagendado",
      cancellation: "Um agendamento foi cancelado",
    };
    const title = titleByType[body.change_type] ?? "Atualização no seu agendamento";
    const message = body.change_type === "cancellation"
      ? `Agendamento cancelado: ${serviceName} — ${currentEmployeeName} — ${currentDate} às ${currentTime}.` +
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
    if (notifErr) console.error("notif insert error:", notifErr);

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
