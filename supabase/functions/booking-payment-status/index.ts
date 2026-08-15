// Verificação ATIVA no gateway (não depende do webhook chegar).
// Roda no Supabase externo do projeto — nenhuma dependência de infra Lovable.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    );

    const { booking_id } = await req.json().catch(() => ({ booking_id: null }));
    if (!booking_id) return json({ error: "booking_id é obrigatório" }, 400);

    // 1) Estado atual no banco (fonte de verdade local)
    const { data: statusRow } = await supabase.rpc("check_booking_payment_status", {
      _booking_id: booking_id,
    });
    const local = (statusRow ?? {}) as Record<string, any>;
    if (local.is_paid) return json({ is_paid: true, source: "db", ...local });

    const asaasId: string | null = local.asaas_id ?? null;
    if (!asaasId) return json({ is_paid: false, source: "db", ...local });

    // 2) Consulta direta ao Asaas com a chave da empresa (ou do autônomo)
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, company_id, employee_id")
      .eq("id", booking_id)
      .maybeSingle();
    if (!booking) return json({ is_paid: false, source: "db", ...local });

    const { data: settings } = await supabase
      .from("company_payment_settings")
      .select("own_gateway_api_key_encrypted, own_gateway_provider, payout_flow")
      .eq("company_id", booking.company_id)
      .maybeSingle();

    let apiKey = (settings?.own_gateway_api_key_encrypted || "").trim();

    if (booking.employee_id) {
      const { data: eps } = await supabase
        .from("employee_payment_settings")
        .select("api_key_encrypted, is_active, provider")
        .eq("employee_id", booking.employee_id)
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

    // 3) Persiste a confirmação para que o restante do sistema enxergue o mesmo estado
    if (paid) {
      await supabase
        .from("booking_payments")
        .update({ status: "paid" })
        .eq("booking_id", booking_id)
        .eq("asaas_id", asaasId);

      await supabase
        .from("bookings")
        .update({ payment_status: "paid" })
        .eq("id", booking_id);
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
