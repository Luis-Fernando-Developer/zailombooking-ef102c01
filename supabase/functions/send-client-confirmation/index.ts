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
    // Usamos UPSERT mas tratamos o conflito de token único se necessário
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

    // 3. Enviar notificação via WhatsApp (Fallback quando SMTP não funciona ou preferência do usuário)
    // Buscamos se a empresa tem WhatsApp configurado
    const { data: channel } = await supabaseClient.rpc("resolve_whatsapp_channel", { p_company: company_id });
    
    let whatsapp_sent = false;

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

    console.log(`[CONFIRMATION EMAIL] Para: ${email}, Link: ${confirmationLink}`);
    
    return new Response(JSON.stringify({ 
        success: true, 
        message: whatsapp_sent ? "Link de confirmação enviado via WhatsApp." : "Link de confirmação gerado (SMTP indisponível).",
        whatsapp_sent,
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