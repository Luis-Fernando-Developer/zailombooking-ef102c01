// ============================================================================
// _shared/notify-whatsapp.ts
// Helper compartilhado. Resolve o canal WhatsApp ativo para uma empresa,
// respeita preferência por instância, enforça limites do plano e envia a
// mensagem via Chatbot Zailom (Flow) OU pela API WhatsApp direta (Evolution).
//
// Uso (dentro de qualquer edge function):
//   import { sendWhatsApp } from "../_shared/notify-whatsapp.ts";
//   await sendWhatsApp(supabase, company_id, "5511999999999", "Olá!");
//
// Retorna: { via: 'flow'|'direct'|'none', ok, status?, error? }
// ============================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export type WhatsAppSendResult = {
  via: "flow" | "direct" | "none";
  ok: boolean;
  status?: number;
  error?: string;
  response?: unknown;
};

export async function sendWhatsApp(
  supabase: SupabaseClient,
  companyId: string,
  to: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const cleanTo = String(to || "").replace(/\D/g, "");
  if (!cleanTo || !message) return { via: "none", ok: false, error: "invalid_input" };

  // 0. Enforce message limit do plano ---------------------------------------
  const { data: limits } = await supabase.rpc("whatsapp_get_plan_limits", { p_company: companyId });
  const l = limits as { messages_allowed?: boolean } | null;
  if (l && l.messages_allowed === false) {
    return { via: "none", ok: false, error: "message_limit_reached" };
  }

  // 1. Resolve canal via RPC (garante consistência com o painel)
  const { data: channel } = await supabase
    .rpc("resolve_whatsapp_channel", { p_company: companyId });
  if (!channel || channel === "none") return { via: "none", ok: false, error: "channel_disabled" };

  // 2. FLOW ------------------------------------------------------------------
  if (channel === "flow") {
    const { data: cb } = await supabase.from("chatbot_integration")
      .select("flow_api_key, flow_api_base_url, flow_selected_instance_name, flow_default_bot_id")
      .eq("company_id", companyId).maybeSingle();
    if (!cb?.flow_api_key) return { via: "flow", ok: false, error: "flow_not_configured" };

    const base = (cb.flow_api_base_url || "https://api-flowbuilder.zailom.com/functions/v1/flow-api").replace(/\/$/, "");
    const res = await fetch(`${base}/v1/messages/send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cb.flow_api_key}`,
        "x-flow-api-key": cb.flow_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instance: cb.flow_selected_instance_name,
        bot_id: cb.flow_default_bot_id,
        to: cleanTo, text: message,
      }),
    });
    const respBody = await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; }});
    if (res.ok) await supabase.rpc("whatsapp_bump_usage", { p_company: companyId });
    return { via: "flow", ok: res.ok, status: res.status, response: respBody };
  }

  // 3. DIRECT (API WhatsApp / Evolution) -------------------------------------
  const { data: integ } = await supabase.from("whatsapp_integration")
    .select("evolution_base_url, evolution_global_api_key").eq("company_id", companyId).maybeSingle();
  if (!integ?.evolution_base_url) return { via: "direct", ok: false, error: "not_configured" };

  // Prefere instância marcada como default e conectada
  const { data: inst } = await supabase.from("whatsapp_instances")
    .select("instance_name, instance_api_key, channel_preference")
    .eq("company_id", companyId).eq("status", "connected")
    .order("is_default", { ascending: false }).limit(1).maybeSingle();
  if (!inst) return { via: "direct", ok: false, error: "no_connected_instance" };

  // Respeita override per-instance: se a instância padrão está com 'disabled'
  // ou 'flow_only', não enviamos por ela.
  const instPref = (inst as { channel_preference?: string | null }).channel_preference ?? "auto";
  if (instPref === "disabled" || instPref === "flow_only") {
    return { via: "direct", ok: false, error: "instance_channel_disabled" };
  }

  const key = inst.instance_api_key ?? integ.evolution_global_api_key;
  if (!key) return { via: "direct", ok: false, error: "no_api_key" };

  const url = `${integ.evolution_base_url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(inst.instance_name)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "apikey": key, "Content-Type": "application/json" },
    body: JSON.stringify({ number: cleanTo, text: message }),
  });
  const respBody = await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; }});
  if (res.ok) await supabase.rpc("whatsapp_bump_usage", { p_company: companyId });
  return { via: "direct", ok: res.ok, status: res.status, response: respBody };
}

// Renderizador simples de templates: substitui {{key}} pelos valores fornecidos.
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

export async function loadWhatsAppTemplate(
  supabase: SupabaseClient,
  companyId: string,
  eventKey: string,
): Promise<string | null> {
  const { data } = await supabase.from("whatsapp_templates")
    .select("template, enabled")
    .eq("company_id", companyId).eq("event_key", eventKey).maybeSingle();
  if (!data || data.enabled === false) return null;
  return data.template as string;
}
