import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Edge Function: login-with-context
 * Autentica um usuário baseado na senha contextual da empresa.
 * A senha nunca é usada como senha global do Supabase Auth.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const {
      email: rawEmail,
      password,
      company_slug,
      returnTo,
      origin: rawOrigin,
    } = await req.json();

    const email = rawEmail?.trim();

    if (!email || !password || !company_slug) {
      return new Response(JSON.stringify({ error: "E-mail, senha e empresa são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company, error: companyError } = await supabaseClient
      .from("companies")
      .select("id")
      .eq("slug", company_slug)
      .maybeSingle();

    if (companyError) {
      console.error("[LOGIN_CONTEXT] Erro ao buscar empresa:", companyError);
      return new Response(JSON.stringify({ error: "Não foi possível localizar a empresa." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!company) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: client, error: clientError } = await supabaseClient
      .from("clients")
      .select("id,user_id,password_hash")
      .eq("company_id", company.id)
      .ilike("email", email)
      .maybeSingle();

    if (clientError) {
      console.error("[LOGIN_CONTEXT] Erro ao buscar cliente:", clientError);
      return new Response(JSON.stringify({ error: "Não foi possível localizar o cliente." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (client && (!client.user_id || !client.password_hash)) {
      return new Response(JSON.stringify({
        success: false,
        needs_first_access: true,
        error: "Este cliente ainda não possui uma senha definida para esta empresa.",
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: validData, error: validError } = await supabaseClient.rpc("validate_client_password", {
      p_email: email,
      p_company_slug: company_slug,
      p_password: password,
    });

    if (validError || !validData?.success) {
      return new Response(JSON.stringify({
        error: validData?.error || "Credenciais inválidas para esta empresa.",
        needs_link: validData?.needs_link,
        user_id: validData?.user_id,
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the browser origin sent by Login.tsx when it is a valid HTTP(S) origin.
    // This keeps local development redirects on the local host instead of falling back
    // to the production SITE_URL.
    const configuredSiteUrl = Deno.env.get("SITE_URL") || "https://booking.zailom.com";
    let siteUrl = configuredSiteUrl;

    if (typeof rawOrigin === "string" && rawOrigin.trim()) {
      try {
        const originUrl = new URL(rawOrigin.trim());
        if (originUrl.protocol === "http:" || originUrl.protocol === "https:") {
          siteUrl = originUrl.origin;
        }
      } catch (originError) {
        console.warn("[LOGIN_CONTEXT] Origin recebido é inválido; usando SITE_URL.", originError);
      }
    }

    const normalizedSiteUrl = siteUrl.replace(/\/+$/, "");
    let redirectUrl = `${normalizedSiteUrl}/${company_slug}/agendamentos`;

    if (returnTo === "agendar") {
      redirectUrl = `${normalizedSiteUrl}/${company_slug}/agendar?restore=true`;
    }

    console.log("[LOGIN_CONTEXT] Origin recebido:", rawOrigin);
    console.log("[LOGIN_CONTEXT] SITE_URL configurado:", configuredSiteUrl);
    console.log("[LOGIN_CONTEXT] Redirect final:", redirectUrl);

    const { data: otpData, error: otpError } = await supabaseClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (otpError || !otpData?.properties?.action_link) {
      console.error("[LOGIN_CONTEXT] Erro ao gerar link de sessão:", otpError);
      throw new Error("Não foi possível gerar a sessão de acesso.");
    }

    return new Response(JSON.stringify({
      success: true,
      action_link: otpData.properties.action_link,
      message: "Autenticação contextual realizada.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[LOGIN_CONTEXT] Erro no login contextual:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
