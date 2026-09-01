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

    const { user_id, company_id, name, email, phone, cpf, password, signup_flow, redirectTo, returnTo } = await req.json();

    // Validação mínima
    if (!company_id || !email) {
      return new Response(JSON.stringify({ error: "Parâmetros obrigatórios ausentes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────
    // FLUXO 1: Primeiro cadastro (usuário novo)
    // Cria usuário no Auth via Admin API + envia link nosso
    // ─────────────────────────────────────────────
    if (signup_flow === true) {
      // 1a. Criar usuário no Supabase Auth via Admin API (sem enviar email automático)
      const { data: authUser, error: createUserError } = await supabaseClient.auth.admin.createUser({
        email: email,
        email_confirm: true,
        user_metadata: {
          name,
          phone,
          role: "client",
        },
      });

      if (createUserError || !authUser?.user) {
        console.error("Erro ao criar usuário no Auth:", createUserError);
        return new Response(JSON.stringify({ error: createUserError?.message || "Erro ao criar usuário" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newUserId = authUser.user.id;

      // 1b. Inserir vínculo na tabela clients
      const { error: clientError } = await supabaseClient
        .from("clients")
        .insert({
          user_id: newUserId,
          company_id,
          name,
          email,
          phone,
          cpf: cpf || null,
        });

      if (clientError) {
        console.error("Erro ao criar perfil do cliente:", clientError);
      }

      // 1c. Buscar empresa para o link
      const { data: company } = await supabaseClient
        .from("companies")
        .select("name, slug")
        .eq("id", company_id)
        .single();

      // 1d. Criar registro de confirmação com token
      // upsert via SELECT + UPDATE/INSERT (não依赖 nome de constraint única)
      const { data: existing } = await supabaseClient
        .from("client_confirmations")
        .select("id, confirmation_token")
        .eq("user_id", newUserId)
        .eq("company_id", company_id)
        .maybeSingle();

      let confirmationToken: string | null = existing?.confirmation_token ?? null;

      if (existing) {
        await supabaseClient
          .from("client_confirmations")
          .update({
            email, name, phone, cpf,
            password_hash: null,
            confirmed_at: null,
          })
          .eq("id", existing.id);
      } else {
        const { data: inserted, error: insertErr } = await supabaseClient
          .from("client_confirmations")
          .insert({
            user_id: newUserId,
            company_id,
            email,
            name,
            phone,
            cpf,
            password_hash: null,
            confirmed_at: null,
          })
          .select("confirmation_token")
          .single();
        if (insertErr) {
          console.error("Erro ao criar confirmação:", insertErr);
        } else {
          confirmationToken = inserted?.confirmation_token ?? null;
        }
      }

      const confirmationLink = `${new URL(redirectTo).origin}/confirmar-vincular?token=${confirmationToken}&slug=${company?.slug}&type=signup${returnTo ? `&returnTo=${returnTo}` : ''}`;

      // 1e. Enviar link via WhatsApp ou e-mail
      let whatsapp_sent = false;
      let email_sent = false;

      const sendMessage = async (msg: string) => {
        if (channel && channel !== "none") {
          try {
            const { data: integRow } = await supabaseClient.from("whatsapp_integration")
              .select("wa_api_key").eq("company_id", company_id).maybeSingle();
            const { data: inst } = await supabaseClient.from("whatsapp_instances")
              .select("wa_instance_id")
              .eq("company_id", company_id).eq("status", "connected")
              .order("is_default", { ascending: false }).limit(1).maybeSingle();
            if (integRow?.wa_api_key && inst?.wa_instance_id && phone) {
              const WA_BASE = (Deno.env.get("WA_SERVICE_BASE_URL") ?? "https://wa.zailom.com").replace(/\/$/, "");
              const cleanTo = String(phone).replace(/\D/g, "");
              const waRes = await fetch(`${WA_BASE}/v1/instances/${inst.wa_instance_id}/message/sendText`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${integRow.wa_api_key}`, "Content-Type": "application/json" },
                body: JSON.stringify({ number: cleanTo, text: msg }),
              });
              whatsapp_sent = waRes.ok;
            }
          } catch (e) {
            console.error("Erro WhatsApp:", e);
          }
        }

        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey) {
          try {
            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
              body: JSON.stringify({
                from: "Zailom Booking <atendimento@suport-mail.booking.zailom.com>",
                to: [email],
                subject: `Confirme seu cadastro em ${company?.name}`,
                html: `<div style="font-family: sans-serif; padding: 20px;"><h2>Olá ${name}!</h2><p>Você criou uma conta na empresa <strong>${company?.name}</strong>.</p><p>Clique no botão abaixo para confirmar e criar sua senha:</p><a href="${confirmationLink}" style="display:inline-block;background:#8B5CF6;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;margin:20px 0;">Confirmar Cadastro</a></div>`,
              }),
            });
            email_sent = emailRes.ok;
          } catch (e) {
            console.error("Erro e-mail:", e);
          }
        }
      };

      const channel = await supabaseClient.rpc("resolve_whatsapp_channel", { p_company: company_id });
      const message = `🎉 Olá ${name}!

Seu cadastro na empresa *${company?.name}* foi iniciado.

Clique no link abaixo para confirmar e criar sua senha:

🔗 ${confirmationLink}

Se não foi você, ignore esta mensagem.`;
      await sendMessage(message);

      console.log(`[SIGNUP_FLOW] Novo usuário: ${email}, Link: ${confirmationLink}`);

      return new Response(JSON.stringify({
        success: true,
        message: whatsapp_sent || email_sent ? "Link de confirmação enviado." : "Link de confirmação gerado.",
        whatsapp_sent,
        email_sent,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ─────────────────────────────────────────────
    // FLUXO 2: Vínculo de usuário existente a empresa
    // (fluxo original)
    // ─────────────────────────────────────────────
    if (!user_id || !company_id) {
      return new Response(JSON.stringify({ error: "Parâmetros user_id e company_id obrigatórios para vínculo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: confData, error: confError } = await supabaseClient
      .from("client_confirmations")
      .upsert({
        user_id,
        company_id,
        email,
        name,
        phone,
        cpf,
        password_hash: password,
        confirmed_at: null,
      }, {
        onConflict: 'user_id,company_id'
      })
      .select("confirmation_token")
      .single();

    // 2. Buscar dados da empresa para o e-mail
    const { data: company, error: companyError } = await supabaseClient
      .from("companies")
      .select("name, slug")
      .eq("id", company_id)
      .single();
    
    if (companyError || !company) {
        throw new Error("Empresa não encontrada");
    }

    const confirmationLink = `${new URL(redirectTo).origin}/confirmar-vincular?token=${confData.confirmation_token}&slug=${company.slug}${returnTo ? `&returnTo=${returnTo}` : ''}`;

    // 2. Lógica de envio: WhatsApp e/ou E-mail
    const { data: channel } = await supabaseClient.rpc("resolve_whatsapp_channel", { p_company: company_id });
    
    let whatsapp_sent = false;
    let email_sent = false;

    // Tentativa via WhatsApp
    if (channel && channel !== "none") {
      try {
        const message = `🔔 Olá ${name}!\n\nVocê solicitou acesso à empresa *${company.name}*.\n\nPara confirmar seu vínculo e ativar sua conta com sua senha exclusiva, clique no link abaixo:\n\n🔗 ${confirmationLink}\n\nSe não foi você, ignore esta mensagem.`;
        
        const { data: integRow } = await supabaseClient.from("whatsapp_integration")
          .select("wa_api_key").eq("company_id", company_id).maybeSingle();
        
        const { data: inst } = await supabaseClient.from("whatsapp_instances")
          .select("wa_instance_id")
          .eq("company_id", company_id).eq("status", "connected")
          .order("is_default", { ascending: false }).limit(1).maybeSingle();

        if (integRow?.wa_api_key && inst?.wa_instance_id && phone) {
           const WA_BASE = (Deno.env.get("WA_SERVICE_BASE_URL") ?? "https://wa.zailom.com").replace(/\/$/, "");
           const cleanTo = String(phone).replace(/\D/g, "");
           
           const waRes = await fetch(`${WA_BASE}/v1/instances/${inst.wa_instance_id}/message/sendText`, {
             method: "POST",
             headers: { "Authorization": `Bearer ${integRow.wa_api_key}`, "Content-Type": "application/json" },
             body: JSON.stringify({ number: cleanTo, text: message }),
           });
           whatsapp_sent = waRes.ok;
        }
      } catch (e) {
        console.error("Erro ao enviar WhatsApp de confirmação:", e);
      }
    }

    // Tentativa via E-mail (Resend)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "Zailom Booking <atendimento@suport-mail.booking.zailom.com>",
            to: [email],
            subject: `Confirme seu vínculo com ${company.name}`,
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2>Olá ${name}!</h2>
                <p>Você solicitou acesso à empresa <strong>${company.name}</strong> no Zailom Booking.</p>
                <p><strong>Atenção:</strong> Você pode usar qualquer senha para este cadastro. Ela será sua senha exclusiva para esta empresa.</p>
                <p>Para confirmar seu vínculo e ativar seu acesso, clique no botão abaixo:</p>
                <a href="${confirmationLink}" style="display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Confirmar Vínculo</a>

                <p>Se você não solicitou este acesso, pode ignorar este e-mail.</p>
              </div>
            `,
          }),
        });
        email_sent = emailRes.ok;
      } catch (e) {
        console.error("Erro ao enviar e-mail via Resend:", e);
      }
    }

    console.log(`[CONFIRMATION] Para: ${email}, Link: ${confirmationLink}`);
    
    return new Response(JSON.stringify({ 
        success: true, 
        message: whatsapp_sent || email_sent 
          ? "Link de confirmação enviado." 
          : "Link de confirmação gerado (canais externos indisponíveis).",
        whatsapp_sent,
        email_sent,
        debug_link: confirmationLink
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Erro na Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});