// ============================================================================
// expire-local-bookings
// Processa solicitações de pagamento no local cujo prazo configurado expirou.
// Deve ser chamado por um cron/agendador a cada 1-5 minutos, assim como
// send-booking-reminders. A RPC é idempotente e só devolve linhas alteradas.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing_supabase_configuration" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Não permite que chamadas públicas acionem cancelamentos em lote.
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKey = req.headers.get("apikey") ?? "";
  if (authHeader !== `Bearer ${serviceKey}` && apiKey !== serviceKey) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  try {
    const { data: expired, error } = await supabase.rpc("expire_pending_local_bookings");
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const row of (expired ?? []) as Array<{
      booking_id: string; company_id: string; notify_client: boolean;
    }>) {
      if (!row.notify_client) {
        results.push({ booking_id: row.booking_id, notified: false, reason: "notification_disabled" });
        continue;
      }

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/notify-booking-event`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
          body: JSON.stringify({ booking_id: row.booking_id, event_key: "booking_expired" }),
        });
        const body = await response.text().then((value) => {
          try { return JSON.parse(value); } catch { return value; }
        });
        results.push({ booking_id: row.booking_id, notified: response.ok, status: response.status, response: body });
      } catch (error) {
        results.push({ booking_id: row.booking_id, notified: false, error: (error as Error).message });
      }
    }

    return new Response(JSON.stringify({
      ok: true, expired: (expired ?? []).length, results, ranAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[expire-local-bookings]", error);
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
