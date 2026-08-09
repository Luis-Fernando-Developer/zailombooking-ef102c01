import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, company_id, name, email, phone, cpf, redirectTo } = await req.json();

    if (!user_id || !company_id || !email) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Criar ou atualizar registro de confirmação
    const { data: confData, error: confError } = await supabaseClient
      .from("client_confirmations")
      .upsert({
        user_id,
        company_id,
        email,
        name,
        phone,
        cpf,
        confirmed_at: null, // Resetar se estiver tentando novamente
      })
      .select("confirmation_token")
      .single();

    if (confError) throw confError;

    // 2. Buscar dados da empresa para o e-mail
    const { data: company } = await supabaseClient
      .from("companies")
      .select("name, slug")
      .eq("id", company_id)
      .single();

    const confirmationLink = `${new URL(redirectTo).origin}/confirmar-vincular?token=${confData.confirmation_token}&slug=${company.slug}`;

    // 3. Enviar e-mail de confirmação (Simulação ou via Provedor)
    // Aqui você integraria com Resend, SendGrid ou o próprio Supabase Auth se usasse hooks
    // Por enquanto, vamos logar e retornar sucesso simulando o envio.
    console.log(`[CONFIRMATION EMAIL] Para: ${email}, Link: ${confirmationLink}`);

    // Nota: Em um cenário real, você usaria fetch() para um serviço de e-mail aqui.

    return new Response(JSON.stringify({ success: true, message: "Email de confirmação enviado." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
