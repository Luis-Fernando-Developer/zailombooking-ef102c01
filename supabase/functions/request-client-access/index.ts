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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { email: rawEmail, company_slug } = await req.json();
    const email = String(rawEmail ?? "").trim().toLowerCase();
    const slug = String(company_slug ?? "").trim();

    if (!email || !slug) {
      return new Response(JSON.stringify({
        success: false,
        error: "E-mail e empresa são obrigatórios.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id,name,slug")
      .eq("slug", slug)
      .maybeSingle();

    if (companyError || !company) {
      return new Response(JSON.stringify({
        success: false,
        error: "Não foi possível processar a solicitação.",
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // O cliente precisa existir previamente nesta empresa.
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id,user_id,name,email,phone,cpf,password_hash")
      .eq("company_id", company.id)
      .ilike("email", email)
      .maybeSingle();

    // Resposta genérica para não revelar se um e-mail está cadastrado.
    if (clientError || !client) {
      return new Response(JSON.stringify({
        success: true,
        message: "Se houver um cliente cadastrado com este e-mail, enviaremos as instruções de primeiro acesso.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se já existe senha contextual, não substituímos nem alteramos a senha.
    // O usuário pode continuar usando o login normal ou o fluxo de recuperação existente.
    if (client.password_hash) {
      return new Response(JSON.stringify({
        success: true,
        already_configured: true,
        message: "Este cliente já possui acesso configurado. Use o login ou a recuperação de senha.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId = client.user_id as string | null;

    // Primeiro tenta reaproveitar a identidade global existente.
    if (!userId) {
      const { data: existingUserId, error: lookupError } = await supabase.rpc("get_user_id_by_email", {
        _email: email,
      });

      if (!lookupError && existingUserId) {
        userId = existingUserId;
      }
    }

    // Se ainda não existe identidade, cria somente a identidade no Auth.
    // Nenhuma senha é definida no Auth. A senha contextual será criada em clients.password_hash.
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
        return new Response(JSON.stringify({
          success: false,
          error: "Não foi possível criar o acesso agora.",
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = created.user.id;
    }

    // Vincula a identidade global ao cliente já cadastrado pela recepção.
    if (client.user_id !== userId) {
      const { error: updateClientError } = await supabase
        .from("clients")
        .update({ user_id: userId })
        .eq("id", client.id)
        .eq("company_id", company.id);

      if (updateClientError) throw updateClientError;
    }

    // Cria/renova a confirmação específica desta empresa.
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

    let emailSent = false;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (resendKey) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "Zailom Booking <atendimento@suport-mail.booking.zailom.com>",
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
      emailSent = emailResponse.ok;
    }

    console.log(`[CLIENT_ACCESS] company=${company.id} client=${client.id} user=${userId} email=${email}`);

    return new Response(JSON.stringify({
      success: true,
      email_sent: emailSent,
      message: emailSent
        ? "Enviamos o link de primeiro acesso para o e-mail do cliente."
        : "O link de primeiro acesso foi gerado, mas o e-mail não pôde ser enviado.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro no primeiro acesso do cliente:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Erro interno.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
