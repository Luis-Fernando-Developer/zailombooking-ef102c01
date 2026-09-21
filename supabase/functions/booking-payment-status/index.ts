// Verificação ATIVA no gateway (não depende do webhook chegar).
// Roda no Supabase externo do projeto — nenhuma dependência de infra Lovable.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const PAID_RE = /(paid|confirm|received|settled)/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Sessão não autenticada." }, 401);

    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData?.user) {
      console.error("[BOOKING_STATUS] Auth error:", authError?.message);
      return json({ error: "Sessão inválida ou expirada." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    let booking_id = body?.booking_id ?? null;
    const payment_id = body?.payment_id ?? null;

    let paymentRow: any = null;
    let company_id: string | null = null;

    // O BookingPaymentDialog envia o ID do pagamento Asaas.
    // O registro pode ainda não estar vinculado a um booking durante o pagamento online.
    if (payment_id) {
      const { data: row } = await supabase
        .from("booking_payments")
        .select("id, booking_id, company_id, asaas_id, provider, status, metadata")
        .eq("asaas_id", payment_id)
        .maybeSingle();

      paymentRow = row ?? null;
      booking_id = paymentRow?.booking_id ?? booking_id;
      company_id = paymentRow?.company_id ?? null;
    }

    if (booking_id) {
      const { data: bookingContext } = await supabase
        .from("bookings")
        .select("company_id")
        .eq("id", booking_id)
        .maybeSingle();
      company_id = bookingContext?.company_id ?? company_id;
    }

    if (!booking_id && !paymentRow) {
      return json({ error: "booking_id ou payment_id é obrigatório" }, 400);
    }

    // 1) Estado atual no banco (fonte de verdade local)
    let local: Record<string, any> = {};
    if (booking_id) {
      const { data: statusRow } = await supabase.rpc("check_booking_payment_status", {
        _booking_id: booking_id,
      });
      local = (statusRow ?? {}) as Record<string, any>;
      if (local.is_paid) return json({ is_paid: true, source: "db", ...local });
    }

    const asaasId: string | null = paymentRow?.asaas_id ?? local.asaas_id ?? payment_id ?? null;
    if (!asaasId) return json({ is_paid: false, source: "db", ...local });

    // 2) Consulta direta ao Asaas com a chave da empresa (ou do autônomo)
    let booking: any = null;
    if (booking_id) {
      const { data } = await supabase
        .from("bookings")
        .select("id, company_id, employee_id")
        .eq("id", booking_id)
        .maybeSingle();
      booking = data ?? null;
    }

    if (!company_id && booking?.company_id) company_id = booking.company_id;
    if (!company_id) return json({ is_paid: false, source: "db", ...local });

    const { data: settings } = await supabase
      .from("company_payment_settings")
      .select("own_gateway_api_key_encrypted, own_gateway_provider, payout_flow")
      .eq("company_id", company_id)
      .maybeSingle();

    let apiKey = (settings?.own_gateway_api_key_encrypted || "").trim();

    const employeeId = booking?.employee_id ?? paymentRow?.metadata?.employee_id ?? paymentRow?.metadata?.booking_data?.employee_id;
    if (employeeId) {
      const { data: eps } = await supabase
        .from("employee_payment_settings")
        .select("api_key_encrypted, is_active, provider")
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (eps?.is_active && eps?.api_key_encrypted && settings?.payout_flow === "direct_to_autonomous") {
        apiKey = (eps.api_key_encrypted || "").trim();
      }
    }

    if (!apiKey) return json({ is_paid: false, source: "db", ...local });

    const isSandbox = apiKey.includes("hmlg") || !apiKey.startsWith("$aact_");
    const baseUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://www.asaas.com/api/v3";

    const res = await fetch(`${baseUrl}/payments/${asaasId}`, {
      headers: { access_token: apiKey, "Content-Type": "application/json" },
    });
    const remote = await res.json().catch(() => ({}));
    const remoteStatus: string = remote?.status ?? "";
    const paid = PAID_RE.test(remoteStatus);

    console.log(`[BOOKING_STATUS] ${booking_id} asaas=${asaasId} status=${remoteStatus}`);

    // 3) Só informa "pago" ao frontend depois de persistir o status local.
    // Antes os erros dos UPDATEs eram ignorados, permitindo que o frontend
    // chamasse confirm_online_booking_payment enquanto booking_payments ainda
    // estava como pending.
    if (paid) {
      if (paymentRow?.id) {
        const { error: paymentUpdateError } = await supabase
          .from("booking_payments")
          .update({ status: "paid" })
          .eq("id", paymentRow.id);

        if (paymentUpdateError) {
          console.error("[BOOKING_STATUS] Failed to persist payment status:", paymentUpdateError.message);
          return json({
            is_paid: false,
            source: "db",
            error: "Não foi possível persistir a confirmação do pagamento.",
            ...local,
          });
        }
      } else if (booking_id) {
        const { error: paymentUpdateError } = await supabase
          .from("booking_payments")
          .update({ status: "paid" })
          .eq("booking_id", booking_id)
          .eq("asaas_id", asaasId);

        if (paymentUpdateError) {
          console.error("[BOOKING_STATUS] Failed to persist payment status:", paymentUpdateError.message);
          return json({
            is_paid: false,
            source: "db",
            error: "Não foi possível persistir a confirmação do pagamento.",
            ...local,
          });
        }
      }

      if (booking_id) {
        const { error: bookingUpdateError } = await supabase
          .from("bookings")
          .update({ payment_status: "paid" })
          .eq("id", booking_id);

        if (bookingUpdateError) {
          console.error("[BOOKING_STATUS] Failed to persist booking payment status:", bookingUpdateError.message);
          return json({
            is_paid: false,
            source: "db",
            error: "Não foi possível persistir o status do agendamento.",
            ...local,
          });
        }
      }
    }

    return json({
      is_paid: paid,
      source: "gateway",
      transaction_status: remoteStatus || local.transaction_status,
      booking_status: local.booking_status,
      payment_status: paid ? "paid" : local.payment_status,
    });
  } catch (error: any) {
    console.error("[BOOKING_STATUS] Error:", error?.message);
    // Nunca derruba o polling do front.
    return json({ is_paid: false, error: error?.message ?? "erro" }, 200);
  }
});
