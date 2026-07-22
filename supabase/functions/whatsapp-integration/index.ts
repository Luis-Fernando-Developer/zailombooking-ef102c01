// ============================================================================
// whatsapp-integration — configuração de API WhatsApp por empresa
// Ações:
//   list-providers, save, sync, disconnect, list-instances-remote,
//   create-instance, register-instance, delete-instance, get-qrcode,
//   send-test, refresh-status, list-templates, save-template, delete-template,
//   set-default-instance, set-channel-preference,
//   set-instance-channel-preference, get-plan-limits
//
// Só o provider `evolution` está funcional; os demais retornam
// `provider_unavailable` em create/register.
// Chaves de API NUNCA são retornadas — apenas prefixos.
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

// ─── Providers (espelha src/components/business/whatsapp/providers.ts) ──────
const PROVIDERS = [
  { id: "evolution",        label: "API WhatsApp - 1", enabled: true  },
  { id: "wppconnect",       label: "API WhatsApp - 2", enabled: false },
  { id: "baileys",          label: "API WhatsApp - 3", enabled: false },
  { id: "whatsapp-web-js",  label: "API WhatsApp - 4", enabled: false },
  { id: "gowa",             label: "API WhatsApp - 5", enabled: false },
] as const;

type ProviderId = typeof PROVIDERS[number]["id"];

type UnknownRecord = Record<string, unknown>;

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

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function getByPath(source: unknown, path: string[]): unknown {
  let cursor: unknown = source;
  for (const key of path) {
    const record = asRecord(cursor);
    if (!record || !(key in record)) return null;
    cursor = record[key];
  }
  return cursor;
}

function normalizeWhatsappNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text || /^\d{4}-\d{2}-\d{2}T/.test(text)) return null;

  const beforeAt = text.split("@")[0] ?? text;
  const digits = beforeAt.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function extractConnectedNumber(source: unknown): string | null {
  const preferredPaths = [
    ["instance", "owner"],
    ["instance", "ownerJid"],
    ["instance", "ownerJID"],
    ["instance", "wuid"],
    ["instance", "number"],
    ["instance", "profile", "id"],
    ["owner"],
    ["ownerJid"],
    ["ownerJID"],
    ["wuid"],
    ["number"],
    ["phone"],
    ["jid"],
  ];

  for (const path of preferredPaths) {
    const normalized = normalizeWhatsappNumber(getByPath(source, path));
    if (normalized) return normalized;
  }

  const visit = (value: unknown): string | null => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }

    const record = asRecord(value);
    if (!record) return null;

    for (const [key, nested] of Object.entries(record)) {
      if (/owner|jid|wuid|phone|number/i.test(key)) {
        const normalized = normalizeWhatsappNumber(nested);
        if (normalized) return normalized;
      }
    }

    for (const nested of Object.values(record)) {
      const found = visit(nested);
      if (found) return found;
    }

    return null;
  };

  return visit(source);
}

function pickRemoteInstance(fetchInstancesBody: unknown, instanceName: string): unknown {
  if (!Array.isArray(fetchInstancesBody)) return fetchInstancesBody;
  const match = fetchInstancesBody.find((item) => {
    const remoteName = getByPath(item, ["instance", "instanceName"])
      ?? getByPath(item, ["instanceName"])
      ?? getByPath(item, ["name"]);
    return remoteName === instanceName;
  });
  return match ?? fetchInstancesBody[0] ?? null;
}

function mapEvolutionState(value: unknown): "connected" | "disconnected" | "qrcode" | "connecting" | "unknown" {
  const state = String(value ?? "unknown").toLowerCase();
  if (["open", "connected", "online"].includes(state)) return "connected";
  if (["close", "closed", "disconnected", "offline"].includes(state)) return "disconnected";
  if (["connecting", "pairing"].includes(state)) return "connecting";
  if (["qrcode", "qr", "qr_code"].includes(state)) return "qrcode";
  return "unknown";
}

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 40);
}

const channelPreferences = new Set(["auto", "flow_only", "direct_only", "disabled"]);

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

    // list-providers e get-plan-limits podem ser chamados sem company_id?
    // Mantemos company_id obrigatório para consistência (get-plan-limits precisa).
    if (!company_id) return json({ error: "Missing company_id" }, 400);

    // Verifica que o usuário pertence à empresa
    const { data: perm } = await supabase.rpc("user_belongs_to_company", {
      _user_id: user.id, _company_id: company_id,
    });
    if (perm === false) return json({ error: "Forbidden" }, 403);

    // ---------- LIST PROVIDERS -------------------------------------------
    if (action === "list-providers") {
      return json({ success: true, providers: PROVIDERS });
    }

    // ---------- GET PLAN LIMITS ------------------------------------------
    if (action === "get-plan-limits") {
      const { data, error } = await supabase.rpc("whatsapp_get_plan_limits", { p_company: company_id });
      if (error) throw error;
      return json({ success: true, limits: data });
    }

    // ---------- CHANNEL PREFERENCE (empresa) -----------------------------
    if (action === "set-channel-preference") {
      const { preference } = body;
      if (typeof preference !== "string" || !channelPreferences.has(preference)) {
        return json({ error: "invalid_channel_preference" }, 400);
      }
      const { error } = await supabase
        .from("companies")
        .update({ whatsapp_channel_preference: preference })
        .eq("id", company_id);
      if (error) throw error;
      return json({ success: true, preference });
    }

    // ---------- CHANNEL PREFERENCE (por instância) -----------------------
    if (action === "set-instance-channel-preference") {
      const { instance_id, preference } = body;
      if (!instance_id) return json({ error: "Missing instance_id" }, 400);
      if (typeof preference !== "string" || !channelPreferences.has(preference)) {
        return json({ error: "invalid_channel_preference" }, 400);
      }
      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ channel_preference: preference, updated_at: new Date().toISOString() })
        .eq("id", instance_id).eq("company_id", company_id);
      if (error) throw error;
      return json({ success: true, preference });
    }

    // ---------- SAVE global config ---------------------------------------
    if (action === "save" || action === "setup-integration") {
      const { base_url, global_api_key } = body;
      if (!base_url) return json({ error: "Missing base_url" }, 400);

      if (global_api_key) {
        const test = await evoFetch(base_url, global_api_key, "/instance/fetchInstances");
        if (!test.ok) {
          return json({
            error: "provider_validation_failed",
            message: "Não foi possível validar a Base URL / chave global.",
            status: test.status,
            provider_response: test.body,
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

    async function loadIntegration() {
      const { data, error } = await supabase
        .from("whatsapp_integration")
        .select("evolution_base_url, evolution_global_api_key, is_active")
        .eq("company_id", company_id)
        .maybeSingle();
      if (error) throw error;
      // Fallback para credenciais globais do sistema (Evo centralizada)
      const envBase = Deno.env.get("EVOLUTION_GLOBAL_BASE_URL") ?? "";
      const envKey  = Deno.env.get("EVOLUTION_GLOBAL_API_KEY") ?? "";
      return {
        evolution_base_url: data?.evolution_base_url || envBase || null,
        evolution_global_api_key: data?.evolution_global_api_key || envKey || null,
        is_active: data?.is_active ?? true,
      };
    }


    async function loadCompanySlug(): Promise<string> {
      const { data } = await supabase.from("companies")
        .select("slug").eq("id", company_id).maybeSingle();
      return String((data as { slug?: string } | null)?.slug ?? "empresa");
    }

    async function guardConnectionLimit() {
      const { data } = await supabase.rpc("whatsapp_get_plan_limits", { p_company: company_id });
      const limits = data as {
        connections_allowed?: boolean; max_connections?: number | null;
        current_connections?: number; plan_tier?: string;
      } | null;
      if (limits && limits.connections_allowed === false) {
        return {
          blocked: true,
          payload: {
            error: "connection_limit_reached",
            message: `Limite de conexões WhatsApp do plano ${limits.plan_tier} atingido (${limits.current_connections}/${limits.max_connections}).`,
            limits,
          },
        };
      }
      return { blocked: false as const };
    }

    // ---------- DISCONNECT global ----------------------------------------
    if (action === "disconnect") {
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

    // ---------- LIST REMOTE ---------------------------------------------
    if (action === "list-instances-remote") {
      const integ = await loadIntegration();
      if (!integ?.evolution_base_url || !integ.evolution_global_api_key) {
        return json({ error: "not_connected" }, 400);
      }
      const res = await evoFetch(integ.evolution_base_url, integ.evolution_global_api_key,
        "/instance/fetchInstances");
      if (!res.ok) return json({ error: "provider_error", provider_response: res.body }, res.status);
      return json({ success: true, data: res.body });
    }

    // ---------- CREATE instance -----------------------------------------
    if (action === "create-instance") {
      const providerId = (body.provider as ProviderId) ?? "evolution";
      const providerConf = PROVIDERS.find((p) => p.id === providerId);
      if (!providerConf) return json({ error: "invalid_provider" }, 400);
      if (!providerConf.enabled) {
        return json({ error: "provider_unavailable", message: "Provider indisponível no momento." }, 400);
      }

      const friendlyName = String(body.friendly_name ?? "").trim();
      if (!friendlyName) return json({ error: "Missing friendly_name" }, 400);

      const guard = await guardConnectionLimit();
      if (guard.blocked) return json(guard.payload, 402);

      const integ = await loadIntegration();
      if (!integ?.evolution_base_url || !integ.evolution_global_api_key) {
        return json({ error: "global_key_required" }, 400);
      }

      const slug = await loadCompanySlug();

      // Insere primeiro para reservar display_index (trigger atribui)
      const placeholder = `pending-${crypto.randomUUID()}`;
      const { data: reserved, error: reserveErr } = await supabase.from("whatsapp_instances").insert({
        company_id,
        provider: providerId,
        instance_name: placeholder,
        friendly_name: friendlyName,
        channel_preference: channelPreferences.has(String(body.channel_preference)) ? String(body.channel_preference) : "auto",
        status: "connecting",
        is_default: !!body.set_default,
      }).select("id, display_index").single();
      if (reserveErr) {
        if (String(reserveErr.message).includes("uq_whatsapp_instances_friendly_name")) {
          return json({ error: "friendly_name_taken", message: "Já existe uma conexão com esse nome." }, 409);
        }
        throw reserveErr;
      }

      const techName = `zb-${slugify(slug)}-${reserved.display_index}-${slugify(friendlyName)}`;

      const res = await evoFetch(integ.evolution_base_url, integ.evolution_global_api_key,
        "/instance/create", {
          method: "POST",
          body: JSON.stringify({
            instanceName: techName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        });
      if (!res.ok) {
        // rollback
        await supabase.from("whatsapp_instances").delete().eq("id", reserved.id);
        return json({ error: "provider_create_failed", provider_response: res.body }, res.status);
      }

      const instanceApiKey =
        res.body?.hash?.apikey ?? res.body?.hash ?? res.body?.instance?.apikey ?? null;

      const { data: updated, error: updErr } = await supabase.from("whatsapp_instances").update({
        instance_name: techName,
        instance_api_key: instanceApiKey,
        api_key_prefix: instanceApiKey ? prefixOf(instanceApiKey) : null,
        status: "qrcode",
        metadata: { created_via: "booking", provider: providerId, created_response: res.body },
        last_synced_at: new Date().toISOString(),
      }).eq("id", reserved.id).select("id, instance_name, friendly_name, provider, display_index, api_key_prefix, status, is_default").single();
      if (updErr) throw updErr;

      return json({ success: true, instance: updated, instance_id: updated.id });
    }

    // ---------- REGISTER existing ---------------------------------------
    if (action === "register-instance") {
      const providerId = (body.provider as ProviderId) ?? "evolution";
      const providerConf = PROVIDERS.find((p) => p.id === providerId);
      if (!providerConf) return json({ error: "invalid_provider" }, 400);
      if (!providerConf.enabled) {
        return json({ error: "provider_unavailable", message: "Provider indisponível no momento." }, 400);
      }

      const { instance_name, instance_api_key, set_default } = body;
      const friendlyName = String(body.friendly_name ?? "").trim() || String(instance_name ?? "").trim();
      if (!instance_name || !instance_api_key) {
        return json({ error: "Missing instance_name/instance_api_key" }, 400);
      }

      const guard = await guardConnectionLimit();
      if (guard.blocked) return json(guard.payload, 402);

      const integ = await loadIntegration();
      if (!integ?.evolution_base_url) return json({ error: "base_url_required" }, 400);

      const test = await evoFetch(integ.evolution_base_url, instance_api_key,
        `/instance/connectionState/${encodeURIComponent(instance_name)}`);
      if (!test.ok) {
        return json({ error: "instance_validation_failed", provider_response: test.body }, test.status);
      }
      const mapped = mapEvolutionState(getByPath(test.body, ["instance", "state"]) ?? getByPath(test.body, ["state"]));
      const connectedNumber = extractConnectedNumber(test.body);

      const { data, error } = await supabase.from("whatsapp_instances").upsert({
        company_id,
        provider: providerId,
        instance_name,
        friendly_name: friendlyName,
        instance_api_key,
        api_key_prefix: prefixOf(instance_api_key),
        status: mapped,
        connected_number: connectedNumber,
        is_default: !!set_default,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "company_id,instance_name" }).select().single();
      if (error) {
        if (String(error.message).includes("uq_whatsapp_instances_friendly_name")) {
          return json({ error: "friendly_name_taken", message: "Já existe uma conexão com esse nome." }, 409);
        }
        throw error;
      }
      return json({ success: true, instance: data });
    }

    // ---------- DELETE instance -----------------------------------------
    if (action === "delete-instance") {
      const { instance_id } = body;
      if (!instance_id) return json({ error: "Missing instance_id" }, 400);
      const { data: inst } = await supabase.from("whatsapp_instances")
        .select("instance_name, instance_api_key").eq("id", instance_id).eq("company_id", company_id).maybeSingle();
      if (!inst) return json({ error: "not_found" }, 404);
      const integ = await loadIntegration();
      const key = integ?.evolution_global_api_key ?? inst.instance_api_key;
      if (integ?.evolution_base_url && key) {
        await evoFetch(integ.evolution_base_url, key,
          `/instance/delete/${encodeURIComponent(inst.instance_name)}`, { method: "DELETE" });
      }
      await supabase.from("whatsapp_instances").delete().eq("id", instance_id).eq("company_id", company_id);
      return json({ success: true });
    }

    // ---------- GET QRCODE ----------------------------------------------
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
      if (!res.ok) return json({ error: "provider_error", provider_response: res.body }, res.status);
      return json({ success: true, qrcode: res.body });
    }

    // ---------- REFRESH STATUS ------------------------------------------
    if (action === "refresh-status") {
      const { instance_id } = body;
      const integ = await loadIntegration();
      if (!integ?.evolution_base_url) return json({ error: "not_connected" }, 400);

      const q = supabase.from("whatsapp_instances")
        .select("id, instance_name, instance_api_key, metadata").eq("company_id", company_id);
      const { data: rows } = instance_id ? await q.eq("id", instance_id) : await q;
      if (!rows?.length) return json({ success: true, updated: 0 });

      let updated = 0;
      for (const r of rows) {
        const key = r.instance_api_key ?? integ.evolution_global_api_key;
        if (!key) continue;
        const st = await evoFetch(integ.evolution_base_url, key,
          `/instance/connectionState/${encodeURIComponent(r.instance_name)}`);
        let mapped = mapEvolutionState(getByPath(st.body, ["instance", "state"]) ?? getByPath(st.body, ["state"]));
        let number = extractConnectedNumber(st.body);
        let providerStatus: number | null = st.status;
        if (integ.evolution_global_api_key) {
          const fi = await evoFetch(integ.evolution_base_url, integ.evolution_global_api_key,
            "/instance/fetchInstances");
          providerStatus = fi.status;
          if (fi.ok) {
            const remote = pickRemoteInstance(fi.body, r.instance_name);
            const remoteState = getByPath(remote, ["instance", "state"])
              ?? getByPath(remote, ["instance", "status"])
              ?? getByPath(remote, ["instance", "connectionStatus", "state"])
              ?? getByPath(remote, ["connectionStatus", "state"])
              ?? getByPath(remote, ["status"]);
            const remoteMapped = mapEvolutionState(remoteState);
            if (remoteMapped !== "unknown") mapped = remoteMapped;
            number = extractConnectedNumber(remote) ?? number;
          }
        }
        await supabase.from("whatsapp_instances").update({
          status: mapped,
          connected_number: number,
          metadata: {
            ...(asRecord(r.metadata) ?? {}),
            last_refresh: {
              at: new Date().toISOString(),
              connection_state_status: st.status,
              fetch_instances_status: providerStatus,
              number_found: Boolean(number),
            },
          },
          last_synced_at: new Date().toISOString(),
        }).eq("id", r.id);
        updated++;
      }
      return json({ success: true, updated });
    }

    // ---------- SEND TEST -----------------------------------------------
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
      if (!res.ok) return json({ error: "send_failed", provider_response: res.body }, res.status);
      // Conta uso apenas quando sucesso
      await supabase.rpc("whatsapp_bump_usage", { p_company: company_id });
      return json({ success: true, provider_response: res.body });
    }

    // ---------- TEMPLATES -----------------------------------------------
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

    // ---------- SET DEFAULT INSTANCE ------------------------------------
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
