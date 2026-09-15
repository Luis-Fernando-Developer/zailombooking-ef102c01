import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { email: rawEmail, company_slug } = await req.json();
    const email = String(rawEmail ?? "").trim().toLowerCase();
    const slug = String(company_slug ?? "").trim();

    if (!email || !slug) {
      return jsonResponse({
        success: false,
        error: "E-mail e empresa são obrigatórios.",
      }, 400);
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id,name,slug")
      .eq("slug", slug)
      .maybeSingle();

    if (companyError || !company) {
      return jsonResponse({
        success: false,
        error: "Não foi possível processar a solicitação.",
      }, 404);
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id,user_id,name,email,phone,cpf,password_hash")
      .eq("company_id", company.id)
      .ilike("email", email)
      .maybeSingle();

    if (clientError || !client) {
      return jsonResponse({
        success: true,
        message: "Se houver um cliente cadastrado com este e-mail, enviaremos as instruções de primeiro acesso.",
      });
    }

    if (client.password_hash) {
      return jsonResponse({
        success: true,
        already_configured: true,
        message: "Este cliente já possui acesso configurado. Use o login ou a recuperação de senha.",
      });
    }

    let userId = client.user_id as string | null;

    if (!userId) {
      const { data: existingUserId, error: lookupError } = await supabase.rpc("get_user_id_by_email", {
        _email: email,
      });

      if (!lookupError && existingUserId) {
        userId = existingUserId;
      }
    }

    if (!userId) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          name: client.name,
          phone: client.phone,
          role: "client",
        },
      });

      if (createError || !created?.user) {
        console.error("Erro ao criar identidade do cliente:", createError);
        return jsonResponse({
          success: false,
          error: "Não foi possível criar o acesso agora.",
        }, 500);
      }

      userId = created.user.id;
    }

    if (client.user_id !== userId) {
      const { error: updateClientError } = await supabase
        .from("clients")
        .update({ user_id: userId })
        .eq("id", client.id)
        .eq("company_id", company.id);

      if (updateClientError) throw updateClientError;
    }

    const { data: confirmation, error: confirmationError } = await supabase
      .from("client_confirmations")
      .upsert({
        user_id: userId,
        company_id: company.id,
        email,
        name: client.name,
        phone: client.phone,
        cpf: client.cpf,
        password_hash: null,
        confirmed_at: null,
      }, {
        onConflict: "user_id,company_id",
      })
      .select("confirmation_token")
      .single();

    if (confirmationError || !confirmation?.confirmation_token) {
      console.error("Erro ao criar confirmação de primeiro acesso:", confirmationError);
      throw new Error("Não foi possível gerar o link de primeiro acesso.");
    }

    const siteUrl = (Deno.env.get("SITE_URL") || "https://booking.zailom.com").replace(/\/$/, "");
    const confirmationLink = `${siteUrl}/confirmar-vincular?token=${confirmation.confirmation_token}&slug=${encodeURIComponent(company.slug)}&type=signup`;

    const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();

    if (!resendKey) {
      console.error("[CLIENT_ACCESS] RESEND_API_KEY não configurada na Edge Function.");
      return jsonResponse({
        success: true,
        email_sent: false,
        email_error: "RESEND_API_KEY não configurada.",
        message: "O link de primeiro acesso foi gerado, mas o e-mail não pôde ser enviado porque o envio de e-mail não está configurado.",
      });
    }

    const from = (Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Ative seu acesso à ${company.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.5">
            <h2>Olá, ${client.name || "Cliente"}!</h2>
            <p>A empresa <strong>${company.name}</strong> cadastrou você como cliente no Zailom Booking.</p>
            <p>Para acessar seus agendamentos, confirme seu primeiro acesso e crie uma <strong>senha exclusiva para esta empresa</strong>.</p>
            <p>A senha desta empresa é independente das suas outras empresas.</p>
            <a href="${confirmationLink}" style="display:inline-block;background:#8B5CF6;color:#fff;padding:12px 22px;text-decoration:none;border-radius:6px;margin:16px 0">Criar meu acesso</a>
            <p>Se você não reconhece este cadastro, ignore esta mensagem.</p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const responseText = await emailResponse.text();
      let resendError: unknown = responseText;

      try {
        resendError = JSON.parse(responseText);
      } catch {
        // Mantém a resposta textual original.
      }

      console.error("[CLIENT_ACCESS] Resend recusou o envio:", {
        status: emailResponse.status,
        statusText: emailResponse.statusText,
        response: resendError,
        from,
        to: email,
      });

      const errorMessage = typeof resendError === "object" && resendError !== null
        ? String((resendError as { message?: unknown }).message ?? responseText)
        : String(resendError);

      return jsonResponse({
        success: true,
        email_sent: false,
        email_error: errorMessage,
        email_status: emailResponse.status,
        message: "O link de primeiro acesso foi gerado, mas o e-mail não pôde ser enviado.",
      });
    }

    const resendResult = await emailResponse.json().catch(() => null);

    console.log("[CLIENT_ACCESS] E-mail de primeiro acesso enviado:", {
      company: company.id,
      client: client.id,
      user: userId,
      email,
      resend: resendResult,
    });

    return jsonResponse({
      success: true,
      email_sent: true,
      message: "Enviamos o link de primeiro acesso para o e-mail do cliente.",
    });
  } catch (error) {
    console.error("Erro no primeiro acesso do cliente:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Erro interno.",
    }, 500);
  }
});
