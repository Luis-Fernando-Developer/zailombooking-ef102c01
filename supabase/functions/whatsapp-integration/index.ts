// ============================================================================
// whatsapp-integration — configuração de Evolution API por empresa
// Ações: save, sync, disconnect, list-instances-remote, create-instance,
//        delete-instance, get-qrcode, send-test, refresh-status,
//        list-templates, save-template
//
// A chave da Evolution NUNCA é retornada — apenas prefixo (`api_key_prefix`).
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Evolution API helpers ──────────────────────────────────────────────────
type EvoResp<T = any> = { ok: boolean; status: number; body: T | null; raw: string };

async function evoFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<EvoResp> {
  const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "apikey": apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
  return { ok: res.ok, status: res.status, body, raw };
}

function prefixOf(k: string) { return k ? k.substring(0, 8) : null; }

// ─── Handler ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { action, company_id } = body ?? {};
    if (!action)     return json({ error: "Missing action" }, 400);
    if (!company_id) return json({ error: "Missing company_id" }, 400);

    // Verifica que o usuário pertence à empresa
    const { data: perm } = await supabase.rpc("user_belongs_to_company", {
      p_user: user.id, p_company: company_id,
    });
    // Se a função não existir com esses parâmetros ainda, fallback: cheque via query
    if (perm === false) return json({ error: "Forbidden" }, 403);

    // ---------- SAVE: registra base_url + (opcional) global key -----------
    if (action === "save") {
      const { base_url, global_api_key } = body;
      if (!base_url) return json({ error: "Missing base_url" }, 400);

      // Se veio uma global key, valida chamando /instance/fetchInstances
      if (global_api_key) {
        const test = await evoFetch(base_url, global_api_key, "/instance/fetchInstances");
        if (!test.ok) {
          return json({
            error: "evolution_validation_failed",
            message: "Não foi possível validar a Base URL / Global API Key.",
            status: test.status,
            evolution_response: test.body,
          }, 400);
        }
      }

      const patch: Record<string, unknown> = {
        company_id,
        evolution_base_url: base_url,
        is_active: true,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (global_api_key) {
        patch.evolution_global_api_key = global_api_key;
        patch.api_key_prefix = prefixOf(global_api_key);
      }

      const { error } = await supabase
        .from("whatsapp_integration")
        .upsert(patch, { onConflict: "company_id" });
      if (error) throw error;
      return json({ success: true });
    }

    // Carrega config global (usado internamente pelas outras ações)
    async function loadIntegration() {
      const { data, error } = await supabase
        .from("whatsapp_integration")
        .select("evolution_base_url, evolution_global_api_key, is_active")
        .eq("company_id", company_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    // ---------- DISCONNECT global -----------------------------------------
    if (action === "disconnect") {
      // limpa tudo — instâncias e integração global
      await supabase.from("whatsapp_instances").delete().eq("company_id", company_id);
      const { error } = await supabase.from("whatsapp_integration")
        .update({
          is_active: false,
          evolution_global_api_key: null,
          api_key_prefix: null,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", company_id);
      if (error) throw error;
      return json({ success: true });
    }

    // ---------- LIST REMOTE (fetchInstances direto na Evolution) ----------
    if (action === "list-instances-remote") {
      const integ = await loadIntegration();
      if (!integ?.evolution_base_url || !integ.evolution_global_api_key) {
        return json({ error: "not_connected" }, 400);
      }
      const res = await evoFetch(integ.evolution_base_url, integ.evolution_global_api_key,
        "/instance/fetchInstances");
      if (!res.ok) return json({ error: "evolution_error", evolution_response: res.body }, res.status);
      return json({ success: true, data: res.body });
    }

    // ---------- CREATE instance (requires global key) --------------------
    if (action === "create-instance") {
      const { instance_name, set_default } = body;
      if (!instance_name) return json({ error: "Missing instance_name" }, 400);
      const integ = await loadIntegration();
      if (!integ?.evolution_base_url || !integ.evolution_global_api_key) {
        return json({ error: "global_key_required" }, 400);
      }
      const res = await evoFetch(integ.evolution_base_url, integ.evolution_global_api_key,
        "/instance/create", {
          method: "POST",
          body: JSON.stringify({
            instanceName: instance_name,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        });
      if (!res.ok) {
        return json({ error: "evolution_create_failed", evolution_response: res.body }, res.status);
      }
      // A Evolution retorna a apikey da instância criada
      const instanceApiKey =
        res.body?.hash?.apikey ?? res.body?.hash ?? res.body?.instance?.apikey ?? null;

      const { data: inserted, error } = await supabase.from("whatsapp_instances").insert({
        company_id,
        instance_name,
        instance_api_key: instanceApiKey,
        api_key_prefix: instanceApiKey ? prefixOf(instanceApiKey) : null,
        status: "qrcode",
        is_default: !!set_default,
        metadata: { created_via: "booking", created_response: res.body },
        last_synced_at: new Date().toISOString(),
      }).select("id, instance_name, api_key_prefix, status, is_default").single();
      if (error) throw error;
      return json({ success: true, instance: inserted, evolution_response: res.body });
    }

    // ---------- REGISTER existing instance (using instance-specific key) --
    if (action === "register-instance") {
      const { instance_name, instance_api_key, set_default } = body;
      if (!instance_name || !instance_api_key) {
        return json({ error: "Missing instance_name/instance_api_key" }, 400);
      }
      const integ = await loadIntegration();
      if (!integ?.evolution_base_url) return json({ error: "base_url_required" }, 400);

      // Valida chamando /instance/connectionState/{name}
      const test = await evoFetch(integ.evolution_base_url, instance_api_key,
        `/instance/connectionState/${encodeURIComponent(instance_name)}`);
      if (!test.ok) {
        return json({ error: "instance_validation_failed", evolution_response: test.body }, test.status);
      }
      const state = test.body?.instance?.state ?? test.body?.state ?? "unknown";
      const mapped = state === "open" ? "connected"
                   : state === "close" ? "disconnected"
                   : state === "connecting" ? "connecting"
                   : "unknown";

      const { data, error } = await supabase.from("whatsapp_instances").upsert({
        company_id,
        instance_name,
        instance_api_key,
        api_key_prefix: prefixOf(instance_api_key),
        status: mapped,
        is_default: !!set_default,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "company_id,instance_name" }).select().single();
      if (error) throw error;
      return json({ success: true, instance: data });
    }

    // ---------- DELETE instance ------------------------------------------
    if (action === "delete-instance") {
      const { instance_id } = body;
      if (!instance_id) return json({ error: "Missing instance_id" }, 400);

      const { data: inst } = await supabase.from("whatsapp_instances")
        .select("instance_name, instance_api_key").eq("id", instance_id).eq("company_id", company_id).maybeSingle();
      if (!inst) return json({ error: "not_found" }, 404);
      const integ = await loadIntegration();
      const key = integ?.evolution_global_api_key ?? inst.instance_api_key;
      if (integ?.evolution_base_url && key) {
        // Tenta remover na Evolution (não falha se der erro remoto)
        await evoFetch(integ.evolution_base_url, key,
          `/instance/delete/${encodeURIComponent(inst.instance_name)}`, { method: "DELETE" });
      }
      await supabase.from("whatsapp_instances").delete().eq("id", instance_id).eq("company_id", company_id);
      return json({ success: true });
    }

    // ---------- GET QRCODE -----------------------------------------------
    if (action === "get-qrcode") {
      const { instance_id } = body;
      if (!instance_id) return json({ error: "Missing instance_id" }, 400);
      const { data: inst } = await supabase.from("whatsapp_instances")
        .select("instance_name, instance_api_key").eq("id", instance_id).eq("company_id", company_id).maybeSingle();
      if (!inst) return json({ error: "not_found" }, 404);
      const integ = await loadIntegration();
      const key = inst.instance_api_key ?? integ?.evolution_global_api_key;
      if (!integ?.evolution_base_url || !key) return json({ error: "no_credentials" }, 400);
      const res = await evoFetch(integ.evolution_base_url, key,
        `/instance/connect/${encodeURIComponent(inst.instance_name)}`);
      if (!res.ok) return json({ error: "evolution_error", evolution_response: res.body }, res.status);
      // Evolution devolve `{ base64, code, pairingCode }` ou similar
      return json({ success: true, qrcode: res.body });
    }

    // ---------- REFRESH STATUS (uma ou todas) ----------------------------
    if (action === "refresh-status") {
      const { instance_id } = body;
      const integ = await loadIntegration();
      if (!integ?.evolution_base_url) return json({ error: "not_connected" }, 400);

      const q = supabase.from("whatsapp_instances")
        .select("id, instance_name, instance_api_key").eq("company_id", company_id);
      const { data: rows } = instance_id ? await q.eq("id", instance_id) : await q;
      if (!rows?.length) return json({ success: true, updated: 0 });

      let updated = 0;
      for (const r of rows) {
        const key = r.instance_api_key ?? integ.evolution_global_api_key;
        if (!key) continue;
        const st = await evoFetch(integ.evolution_base_url, key,
          `/instance/connectionState/${encodeURIComponent(r.instance_name)}`);
        const state = st.body?.instance?.state ?? st.body?.state ?? "unknown";
        const mapped = state === "open" ? "connected"
                     : state === "close" ? "disconnected"
                     : state === "connecting" ? "connecting"
                     : "unknown";
        // busca número
        let number: string | null = null;
        if (integ.evolution_global_api_key) {
          const fi = await evoFetch(integ.evolution_base_url, integ.evolution_global_api_key,
            `/instance/fetchInstances?instanceName=${encodeURIComponent(r.instance_name)}`);
          const first = Array.isArray(fi.body) ? fi.body[0] : fi.body;
          number = first?.instance?.owner ?? first?.owner ?? first?.instance?.wuid ?? null;
          if (typeof number === "string") number = number.replace(/@.+$/, "");
        }
        await supabase.from("whatsapp_instances").update({
          status: mapped,
          connected_number: number,
          last_synced_at: new Date().toISOString(),
        }).eq("id", r.id);
        updated++;
      }
      return json({ success: true, updated });
    }

    // ---------- SEND TEST -------------------------------------------------
    if (action === "send-test") {
      const { instance_id, to, message } = body;
      if (!instance_id || !to) return json({ error: "Missing instance_id/to" }, 400);
      const { data: inst } = await supabase.from("whatsapp_instances")
        .select("instance_name, instance_api_key").eq("id", instance_id).eq("company_id", company_id).maybeSingle();
      if (!inst) return json({ error: "not_found" }, 404);
      const integ = await loadIntegration();
      const key = inst.instance_api_key ?? integ?.evolution_global_api_key;
      if (!integ?.evolution_base_url || !key) return json({ error: "no_credentials" }, 400);
      const res = await evoFetch(integ.evolution_base_url, key,
        `/message/sendText/${encodeURIComponent(inst.instance_name)}`, {
          method: "POST",
          body: JSON.stringify({
            number: String(to).replace(/\D/g, ""),
            text: message || "Teste de conexão WhatsApp — Zailom Booking ✅",
          }),
        });
      if (!res.ok) return json({ error: "send_failed", evolution_response: res.body }, res.status);
      return json({ success: true, evolution_response: res.body });
    }

    // ---------- TEMPLATES -------------------------------------------------
    if (action === "list-templates") {
      const { data, error } = await supabase.from("whatsapp_templates")
        .select("*").eq("company_id", company_id).order("event_key");
      if (error) throw error;
      return json({ success: true, templates: data });
    }
    if (action === "save-template") {
      const { event_key, template, enabled } = body;
      if (!event_key || !template) return json({ error: "Missing event_key/template" }, 400);
      const { data, error } = await supabase.from("whatsapp_templates").upsert({
        company_id, event_key, template,
        enabled: enabled !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id,event_key" }).select().single();
      if (error) throw error;
      return json({ success: true, template: data });
    }
    if (action === "delete-template") {
      const { event_key } = body;
      if (!event_key) return json({ error: "Missing event_key" }, 400);
      await supabase.from("whatsapp_templates")
        .delete().eq("company_id", company_id).eq("event_key", event_key);
      return json({ success: true });
    }

    // ---------- SET DEFAULT INSTANCE -------------------------------------
    if (action === "set-default-instance") {
      const { instance_id } = body;
      if (!instance_id) return json({ error: "Missing instance_id" }, 400);
      const { error } = await supabase.from("whatsapp_instances")
        .update({ is_default: true }).eq("id", instance_id).eq("company_id", company_id);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    console.error("[whatsapp-integration] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
