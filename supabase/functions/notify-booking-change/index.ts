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
    const dateStr = new Date(c.booking_date + "T00:00:00").toLocaleDateString("pt-BR");
    const timeStr = String(c.start_time).slice(0, 5);

    const titleByType: Record<string, string> = {
      reallocation: "Seu agendamento foi realocado",
      reschedule:   "Seu agendamento foi reagendado",
      cancellation: "Seu agendamento foi cancelado",
    };
    const title = titleByType[body.change_type] ?? "Atualização no seu agendamento";
    const message =
      `${c.service?.name} com ${c.employee?.name} — ${dateStr} às ${timeStr}.` +
      (body.reason ? ` Motivo: ${body.reason}` : "");

    // 1) Notificação in-app (sino do cliente / sino da empresa usam company_notifications)
    const { error: notifErr } = await admin.from("company_notifications").insert({
      company_id: c.company_id,
      type: `booking_${body.change_type}`,
      title,
      message,
      link: `/${c.company?.slug}/cliente/agendamentos`,
      metadata: {
        booking_id: c.id,
        client_user_id: c.client?.user_id ?? null,
        client_name: c.client?.name ?? null,
        employee_id: c.employee_id,
        change_type: body.change_type,
        reason: body.reason ?? null,
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
        content: `🔔 ${title}\n${message}`,
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
