const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({
    success: false,
    error: "A confirmação antiga foi desativada. Use o link de criação de senha enviado após a confirmação do pagamento."
  }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
