import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge Function: login-with-context
 * Autentica um usuário baseado na senha contextual da empresa.
 * Se a senha for válida via RPC, gera um link de sessão (OTP) ou usa admin logic 
 * para logar o usuário sem precisar da senha global do Supabase Auth.
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

    // 2. Senha Válida! Agora precisamos criar uma sessão para o usuário.
    // Como não queremos usar a senha global, usamos o Magic Link/OTP Interno (silencioso)
    // para obter um access_token para este user_id.
    
    const { data: otpData, error: otpError } = await supabaseClient.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `/${company_slug}/agendamentos`
      }
    });

    if (otpError || !otpData?.properties?.action_link) {
      console.error("Erro ao gerar link de sessão:", otpError);
      throw new Error("Não foi possível gerar a sessão de acesso.");
    }

    // Retornamos o link de ação ou o token para o frontend finalizar o login
    // O frontend pode usar o action_link para redirecionar ou extrair o token hash.
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
