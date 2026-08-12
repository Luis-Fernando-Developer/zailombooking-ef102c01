import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge Function: login-with-context
 * Autentica um usuário baseado na senha contextual da empresa.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const { email: rawEmail, password, company_slug } = await req.json();
    const email = rawEmail?.trim();

    if (!email || !password || !company_slug) {
      return new Response(JSON.stringify({ error: "E-mail, senha e empresa são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Validar a senha contextual via RPC
    const { data: validData, error: validError } = await supabaseClient.rpc('validate_client_password', {
      p_email: email,
      p_company_slug: company_slug,
      p_password: password
    });

    if (validError || !validData?.success) {
      return new Response(JSON.stringify({ 
        error: validData?.error || "Credenciais inválidas para esta empresa.",
        needs_link: validData?.needs_link,
        user_id: validData?.user_id
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Gerar link de sessão
    // A URL de redirecionamento DEVE ser absoluta para evitar que o Supabase redirecione para a raiz errada
    const siteUrl = Deno.env.get("SITE_URL") || "https://booking.zailom.com";
    const redirectUrl = `${siteUrl}/${company_slug}/agendamentos`;

    console.log(`Gerando link de sessão para ${email}. Redirecionando para: ${redirectUrl}`);

    const { data: otpData, error: otpError } = await supabaseClient.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: redirectUrl
      }
    });

    if (otpError || !otpData?.properties?.action_link) {
      console.error("Erro ao gerar link de sessão:", otpError);
      throw new Error("Não foi possível gerar a sessão de acesso.");
    }

    return new Response(JSON.stringify({ 
      success: true, 
      action_link: otpData.properties.action_link,
      message: "Autenticação contextual realizada."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Erro no login contextual:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
