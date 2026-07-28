// ============================================================================
// send-booking-reminders
//
// Worker chamado por cron (pg_cron ou agendador externo) a cada 1-5 minutos.
// Para cada agendamento elegível retornado por `list_pending_booking_reminders`,
// dispara `notify-booking-event` com event_key `booking_reminder` e registra
// em `booking_reminders_sent` para não repetir.
//
// verify_jwt = false (chamado por cron sem sessão de usuário).
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const url = new URL(req.url);
    const tolerance = Number(url.searchParams.get("tolerance") ?? 5);

    const { data: pending, error } = await supabase.rpc("list_pending_booking_reminders", {
      p_tolerance_minutes: tolerance,
    });
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];

    for (const row of (pending ?? []) as Array<{
      booking_id: string;
      company_id: string;
      offset_minutes: number;
      fire_at: string;
    }>) {
      try {
        const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/notify-booking-event`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "apikey": SERVICE_KEY,
          },
          body: JSON.stringify({
            booking_id: row.booking_id,
            event_key: "booking_reminder",
          }),
        });
        const body = await invokeRes.text().then((t) => {
          try { return JSON.parse(t); } catch { return t; }
        });

        // Registra como enviado mesmo se a notificação falhou por falta de
        // canal/telefone — evita loop tentando enviar toda execução do cron.
        await supabase.from("booking_reminders_sent").insert({
          booking_id: row.booking_id,
          offset_minutes: row.offset_minutes,
        });

        results.push({
          booking_id: row.booking_id,
          offset_minutes: row.offset_minutes,
          ok: invokeRes.ok,
          status: invokeRes.status,
          response: body,
        });
      } catch (e) {
        results.push({
          booking_id: row.booking_id,
          offset_minutes: row.offset_minutes,
          ok: false,
          error: (e as Error).message,
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, ranAt: new Date().toISOString(), results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-booking-reminders] error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
