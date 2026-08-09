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

    const { user_id, company_id, name, email, phone, cpf, password, redirectTo } = await req.json();

    if (!user_id || !company_id || !email) {
      return new Response(JSON.stringify({ error: "Parâmetros obrigatórios ausentes" }), {
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
        password_hash: password, // Senha específica desta empresa
        confirmed_at: null,
      }, {
        onConflict: 'user_id,company_id'
      })
      .select("confirmation_token")
      .single();

    if (confError) {
      console.error("Erro ao criar confirmação:", confError);
      throw confError;
    }

    // 2. Buscar dados da empresa para o e-mail
    const { data: company, error: companyError } = await supabaseClient
      .from("companies")
      .select("name, slug")
      .eq("id", company_id)
      .single();
    
    if (companyError || !company) {
        throw new Error("Empresa não encontrada");
    }

    const confirmationLink = `${new URL(redirectTo).origin}/confirmar-vincular?token=${confData.confirmation_token}&slug=${company.slug}`;

    // 3. Lógica de envio: WhatsApp e/ou E-mail (Resend fallback planejado)
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