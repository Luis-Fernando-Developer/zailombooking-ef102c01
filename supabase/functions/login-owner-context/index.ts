import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const email = String(body?.email ?? "").trim();
    const password = String(body?.password ?? "");
    const companySlug = String(body?.company_slug ?? "").trim();
    const requestedOrigin = String(body?.origin ?? "").trim();

    if (!email || !password || !companySlug) {
      return new Response(JSON.stringify({
        success: false,
        error: "E-mail, senha e empresa são obrigatórios.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: valid, error: validError } = await admin.rpc(
      "validate_owner_password",
      {
        p_email: email,
        p_company_slug: companySlug,
        p_password: password,
      },
    );

    if (validError || !valid?.success) {
      return new Response(JSON.stringify(
        valid ?? {
          success: false,
          error: validError?.message || "Credenciais inválidas.",
        },
      ), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const site = (Deno.env.get("SITE_URL") || "https://booking.zailom.com")
      .replace(/\/$/, "");

    // Preserve the hostname the user used to access the login page.
    // The host is accepted only when the database resolves it to this company,
    // preventing an arbitrary origin from being used as an auth redirect.
    let redirectOrigin = site;
    if (requestedOrigin) {
      try {
        const parsedOrigin = new URL(requestedOrigin);
        const isSecureOrigin = parsedOrigin.protocol === "https:" ||
          (parsedOrigin.hostname === "localhost" && parsedOrigin.protocol === "http:");

        if (isSecureOrigin && parsedOrigin.origin === requestedOrigin.replace(/\/$/, "")) {
          const { data: hostCompanySlug, error: hostError } = await admin.rpc(
            "resolve_company_slug_by_host",
            { p_host: parsedOrigin.hostname.toLowerCase() },
          );

          if (!hostError && hostCompanySlug === companySlug) {
            redirectOrigin = parsedOrigin.origin;
          }
        }
      } catch {
        // Invalid or unrecognized origins fall back to the canonical Booking URL.
      }
    }

    const route = String(body?.returnTo) === "agendar"
      ? `/${companySlug}/agendar?restore=true`
      : `/${companySlug}/admin/dashboard`;
    const redirectTo = `${redirectOrigin}${route}`;

    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (error || !link?.properties?.action_link) {
      throw new Error(error?.message || "Não foi possível gerar a sessão.");
    }

    return new Response(JSON.stringify({
      success: true,
      action_link: link.properties.action_link,
      company_id: valid.company_id,
      user_id: valid.user_id,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Erro interno.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
