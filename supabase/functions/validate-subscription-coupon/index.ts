import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" } });
  if (req.method !== "POST") return json({ valid: false, error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) return json({ valid: false, error: "Configuração do servidor ausente." }, 500);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();
    const planId = String(body?.plan_id ?? "");
    const period = String(body?.billing_period ?? "");
    const originalAmount = Number(body?.original_amount ?? 0);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return json({ valid: false, error: "Informe um código de cupom válido." }, 200);
    if (!planId || !["monthly", "quarterly", "annual"].includes(period) || !(originalAmount > 0)) {
      return json({ valid: false, error: "Selecione um plano e período válidos antes de aplicar o cupom." }, 200);
    }

    const { data: coupon, error } = await admin.from("subscription_coupons")
      .select("id,code,description,discount_type,discount_value,duration_type,duration_cycles,plan_ids,billing_periods,starts_at,expires_at,max_redemptions,is_active")
      .eq("code", code).maybeSingle();
    if (error) throw error;
    if (!coupon || !coupon.is_active) return json({ valid: false, error: "Cupom inválido ou inativo." });
    const now = Date.now();
    if (coupon.starts_at && now < new Date(coupon.starts_at).getTime()) return json({ valid: false, error: "Este cupom ainda não está válido." });
    if (coupon.expires_at && now > new Date(coupon.expires_at).getTime()) return json({ valid: false, error: "Este cupom expirou." });
    if ((coupon.plan_ids || []).length && !coupon.plan_ids.includes(planId)) return json({ valid: false, error: "Este cupom não é válido para o plano selecionado." });
    if (!(coupon.billing_periods || []).includes(period)) return json({ valid: false, error: "Este cupom não é válido para o período selecionado." });

    if (coupon.max_redemptions != null) {
      const { count, error: countError } = await admin.from("subscription_coupon_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("coupon_id", coupon.id).in("status", ["reserved", "applied", "paid"]);
      if (countError) throw countError;
      if ((count || 0) >= coupon.max_redemptions) return json({ valid: false, error: "Este cupom atingiu o limite de utilizações." });
    }

    const discountAmount = coupon.discount_type === "percentage"
      ? Number((originalAmount * Math.min(100, Number(coupon.discount_value)) / 100).toFixed(2))
      : Number(Math.min(originalAmount, Number(coupon.discount_value)).toFixed(2));
    const discountedAmount = Math.max(0, Number((originalAmount - discountAmount).toFixed(2)));
    return json({
      valid: true,
      code: coupon.code,
      description: coupon.description,
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value),
      discount_amount: discountAmount,
      original_amount: originalAmount,
      discounted_amount: discountedAmount,
      duration_type: coupon.duration_type,
      duration_cycles: coupon.duration_type === "first_payment" ? 1 : Number(coupon.duration_cycles),
    });
  } catch (error) {
    console.error("[validate-subscription-coupon]", error);
    return json({ valid: false, error: error instanceof Error ? error.message : "Não foi possível validar o cupom." }, 500);
  }
});
