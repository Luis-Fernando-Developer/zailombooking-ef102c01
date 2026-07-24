// ============================================================================
// whatsapp-integration — proxy fino do Booking → wa-service (wa.zailom.com)
// ----------------------------------------------------------------------------
// Toda comunicação com o WhatsApp acontece via `wa-service`. Esta função:
//   • Provisiona tenant + API key JIT no wa-service para cada company
//   • Guarda `wa_tenant_id` + `wa_api_key` em `whatsapp_integration`
//   • Guarda `wa_instance_id` em `whatsapp_instances`
//   • Traduz as ações usadas pela UI para chamadas REST do wa-service
//
// Ações: list-providers, save, disconnect, create-instance, delete-instance,
// get-qrcode, refresh-status, send-test, list-templates, save-template,
// delete-template, set-default-instance, set-channel-preference,
// set-instance-channel-preference, get-plan-limits, get-settings,
// set-settings, get-webhook, set-webhook, set-presence, logout-instance,
// restart-instance.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

// ─── Providers (mantidos por compat com a UI) ───────────────────────────────
const PROVIDERS = [
  { id: "evolution",       label: "API WhatsApp - 1", enabled: true  },
  { id: "wppconnect",      label: "API WhatsApp - 2", enabled: false },
  { id: "baileys",         label: "API WhatsApp - 3", enabled: false },
  { id: "whatsapp-web-js", label: "API WhatsApp - 4", enabled: false },
  { id: "gowa",            label: "API WhatsApp - 5", enabled: false },
] as const;

// ─── Env do wa-service ──────────────────────────────────────────────────────
const WA_BASE = (Deno.env.get("WA_SERVICE_BASE_URL") ?? "https://wa.zailom.com").replace(/\/$/, "");
const WA_ADMIN_TOKEN = Deno.env.get("WA_SERVICE_ADMIN_TOKEN") ?? "";
// Webhook público para o wa-service devolver eventos (via api-booking.zailom.com)
const WA_WEBHOOK_URL = Deno.env.get("WA_WEBHOOK_PUBLIC_URL")
  ?? "https://api-booking.zailom.com/wa/webhook";

const channelPreferences = new Set(["auto", "flow_only", "direct_only", "disabled"]);

// ─── HTTP helpers ───────────────────────────────────────────────────────────
type WaResp = { ok: boolean; status: number; body: unknown; raw: string };

async function waAdminFetch(path: string, init: RequestInit = {}): Promise<WaResp> {
  const res = await fetch(`${WA_BASE}${path}`, {
    ...init,
    headers: {
      "X-Admin-Token": WA_ADMIN_TOKEN,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
  return { ok: res.ok, status: res.status, body, raw };
}

async function waFetch(apiKey: string, path: string, init: RequestInit = {}): Promise<WaResp> {
  const method = (init.method ?? "GET").toUpperCase();
  // Fastify rejects POST/PUT/PATCH with Content-Type: application/json and empty body
  // (FST_ERR_CTP_EMPTY_JSON_BODY). Ensure body-carrying methods always send at least "{}".
  const needsBody = method !== "GET" && method !== "HEAD" && method !== "DELETE";
  const finalBody = init.body ?? (needsBody ? "{}" : undefined);
  const res = await fetch(`${WA_BASE}${path}`, {
    ...init,
    body: finalBody,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
  return { ok: res.ok, status: res.status, body, raw };
}

function prefixOf(k: string) { return k ? k.substring(0, 12) : null; }

// ─── Provisioning ───────────────────────────────────────────────────────────
async function ensureTenantAndKey(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ tenantId: string; apiKey: string } | { error: unknown; status: number }> {
  if (!WA_ADMIN_TOKEN) return { error: "wa_service_admin_token_missing", status: 500 };

  const { data: integ } = await supabase.from("whatsapp_integration")
    .select("wa_tenant_id, wa_api_key")
    .eq("company_id", companyId).maybeSingle();

  if (integ?.wa_tenant_id && integ?.wa_api_key) {
    return { tenantId: integ.wa_tenant_id, apiKey: integ.wa_api_key };
  }

  // 1. tenant (idempotente por (product, product_tenant_id))
  const { data: company } = await supabase.from("companies")
    .select("name").eq("id", companyId).maybeSingle();
  const tenantRes = await waAdminFetch("/v1/admin/tenants", {
    method: "POST",
    body: JSON.stringify({
      product: "booking",
      product_tenant_id: companyId,
      name: (company as { name?: string } | null)?.name ?? `company_${companyId}`,
    }),
  });
  if (!tenantRes.ok) {
    return { error: { code: "tenant_create_failed", provider: tenantRes.body }, status: tenantRes.status };
  }
  const tenantId = (tenantRes.body as { id?: string } | null)?.id;
  if (!tenantId) return { error: "tenant_id_missing", status: 500 };

  // 2. api key
  const keyRes = await waAdminFetch("/v1/admin/api-keys", {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId, name: `booking-${companyId}` }),
  });
  if (!keyRes.ok) {
    return { error: { code: "api_key_create_failed", provider: keyRes.body }, status: keyRes.status };
  }
  const apiKey = (keyRes.body as { api_key?: string } | null)?.api_key;
  if (!apiKey) return { error: "api_key_missing_in_response", status: 500 };

  // 3. persiste
  await supabase.from("whatsapp_integration").upsert({
    company_id: companyId,
    evolution_base_url: WA_BASE, // legacy col: reaproveita
    is_active: true,
    wa_tenant_id: tenantId,
    wa_api_key: apiKey,
    wa_api_key_prefix: prefixOf(apiKey),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id" });

  return { tenantId, apiKey };
}

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

    const { data: perm } = await supabase.rpc("user_belongs_to_company", {
      _user_id: user.id, _company_id: company_id,
    });
    if (perm === false) return json({ error: "Forbidden" }, 403);

    // ---------- LIST PROVIDERS -------------------------------------------
    if (action === "list-providers") {
      return json({ success: true, providers: PROVIDERS });
    }

    // ---------- PLAN LIMITS ----------------------------------------------
    if (action === "get-plan-limits") {
      const { data, error } = await supabase.rpc("whatsapp_get_plan_limits", { p_company: company_id });
      if (error) throw error;
      return json({ success: true, limits: data });
    }

    // ---------- CHANNEL PREFERENCE ---------------------------------------
    if (action === "set-channel-preference") {
      const { preference } = body;
      if (typeof preference !== "string" || !channelPreferences.has(preference)) {
        return json({ error: "invalid_channel_preference" }, 400);
      }
      const { error } = await supabase.from("companies")
        .update({ whatsapp_channel_preference: preference }).eq("id", company_id);
      if (error) throw error;
      return json({ success: true, preference });
    }
    if (action === "set-instance-channel-preference") {
      const { instance_id, preference } = body;
      if (!instance_id) return json({ error: "Missing instance_id" }, 400);
      if (typeof preference !== "string" || !channelPreferences.has(preference)) {
        return json({ error: "invalid_channel_preference" }, 400);
      }
      const { error } = await supabase.from("whatsapp_instances")
        .update({ channel_preference: preference, updated_at: new Date().toISOString() })
        .eq("id", instance_id).eq("company_id", company_id);
      if (error) throw error;
      return json({ success: true, preference });
    }

    // ---------- SAVE (provisiona tenant + key) ---------------------------
    if (action === "save" || action === "setup-integration") {
      const r = await ensureTenantAndKey(supabase, company_id);
      if ("error" in r) return json({ error: r.error }, r.status);
      return json({ success: true, tenant_id: r.tenantId, key_prefix: prefixOf(r.apiKey) });
    }

    // ---------- Loader que garante credencial pronta ---------------------
    async function ensure(): Promise<
      | { tenantId: string; apiKey: string }
      | { errorResp: Response }
    > {
      const r = await ensureTenantAndKey(supabase, company_id);
      if ("error" in r) return { errorResp: json({ error: r.error }, r.status) };
      return r;
    }

    // ---------- DISCONNECT global ----------------------------------------
    if (action === "disconnect") {
      const { data: rows } = await supabase.from("whatsapp_instances")
        .select("wa_instance_id").eq("company_id", company_id);
      const cur = await ensureTenantAndKey(supabase, company_id);
      if (!("error" in cur)) {
        for (const row of (rows ?? []) as { wa_instance_id: string | null }[]) {
          if (row.wa_instance_id) {
            await waFetch(cur.apiKey, `/v1/instances/${row.wa_instance_id}/delete`, { method: "DELETE" });
          }
        }
      }
      await supabase.from("whatsapp_instances").delete().eq("company_id", company_id);
      await supabase.from("whatsapp_integration")
        .update({
          is_active: false,
          wa_api_key: null,
          wa_api_key_prefix: null,
          wa_tenant_id: null,
          evolution_global_api_key: null,
          api_key_prefix: null,
          updated_at: new Date().toISOString(),
        }).eq("company_id", company_id);
      return json({ success: true });
    }

    async function guardConnectionLimit() {
      const { data } = await supabase.rpc("whatsapp_get_plan_limits", { p_company: company_id });
      const limits = data as {
        connections_allowed?: boolean; max_connections?: number | null;
        current_connections?: number; plan_tier?: string;
      } | null;
      if (limits && limits.connections_allowed === false) {
        return {
          blocked: true as const,
          payload: {
            error: "connection_limit_reached",
            message: `Limite de conexões WhatsApp do plano ${limits.plan_tier} atingido (${limits.current_connections}/${limits.max_connections}).`,
            limits,
          },
        };
      }
      return { blocked: false as const };
    }

    // Loader para ações por-instância
    async function loadInstance(instance_id: unknown) {
      if (!instance_id || typeof instance_id !== "string") {
        return { error: json({ error: "Missing instance_id" }, 400) } as const;
      }
      const { data: inst } = await supabase.from("whatsapp_instances")
        .select("id, wa_instance_id, instance_name")
        .eq("id", instance_id).eq("company_id", company_id).maybeSingle();
      if (!inst || !inst.wa_instance_id) {
        return { error: json({ error: "instance_not_paired" }, 404) } as const;
      }
      const cred = await ensure();
      if ("errorResp" in cred) return { error: cred.errorResp } as const;
      return { inst, apiKey: cred.apiKey } as const;
    }

    // ---------- CREATE instance ------------------------------------------
    if (action === "create-instance") {
      const providerId = String(body.provider ?? "evolution");
      const providerConf = PROVIDERS.find((p) => p.id === providerId);
      if (!providerConf) return json({ error: "invalid_provider" }, 400);
      if (!providerConf.enabled) return json({ error: "provider_unavailable" }, 400);

      const friendlyName = String(body.friendly_name ?? "").trim();
      if (!friendlyName) return json({ error: "Missing friendly_name" }, 400);

      const guard = await guardConnectionLimit();
      if (guard.blocked) return json(guard.payload, 402);

      const cred = await ensure();
      if ("errorResp" in cred) return cred.errorResp;

      // Reserva linha local para pegar display_index
      const placeholder = `pending-${crypto.randomUUID()}`;
      const { data: reserved, error: reserveErr } = await supabase.from("whatsapp_instances").insert({
        company_id,
        provider: providerId,
        instance_name: placeholder,
        friendly_name: friendlyName,
        channel_preference: channelPreferences.has(String(body.channel_preference))
          ? String(body.channel_preference) : "auto",
        status: "connecting",
        is_default: !!body.set_default,
      }).select("id, display_index").single();
      if (reserveErr) {
        if (String(reserveErr.message).includes("uq_whatsapp_instances_friendly_name")) {
          return json({ error: "friendly_name_taken" }, 409);
        }
        throw reserveErr;
      }

      const waRes = await waFetch(cred.apiKey, "/v1/instances/create", {
        method: "POST",
        body: JSON.stringify({
          name: `booking-${company_id.slice(0, 8)}-${reserved.display_index}-${friendlyName.slice(0, 20)}`
            .toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 60),
          webhook_url: WA_WEBHOOK_URL,
          webhook_events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
        }),
      });
      if (!waRes.ok) {
        await supabase.from("whatsapp_instances").delete().eq("id", reserved.id);
        return json({ error: "wa_service_error", provider_response: waRes.body }, waRes.status);
      }

      const rb = waRes.body as { id?: string; qr_code?: string; status?: string } | null;
      const { data: updated, error: updErr } = await supabase.from("whatsapp_instances").update({
        wa_instance_id: rb?.id ?? null,
        instance_name: rb?.id ?? placeholder,
        status: "qrcode",
        metadata: { created_via: "booking", provider: providerId, wa_service_response: waRes.body },
        last_synced_at: new Date().toISOString(),
      }).eq("id", reserved.id)
        .select("id, wa_instance_id, instance_name, friendly_name, provider, display_index, status, is_default")
        .single();
      if (updErr) throw updErr;

      return json({
        success: true,
        instance: updated,
        instance_id: updated.id,
        qrcode: rb?.qr_code ?? null,
      });
    }

    // ---------- DELETE instance ------------------------------------------
    if (action === "delete-instance") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) {
        // remove local mesmo se não pareada
        await supabase.from("whatsapp_instances")
          .delete().eq("id", body.instance_id).eq("company_id", company_id);
        return json({ success: true });
      }
      await waFetch(r.apiKey, `/v1/instances/${r.inst.wa_instance_id}/delete`, { method: "DELETE" });
      await supabase.from("whatsapp_instances")
        .delete().eq("id", r.inst.id).eq("company_id", company_id);
      return json({ success: true });
    }

    // ---------- GET QRCODE (aka connect) ---------------------------------
    if (action === "get-qrcode") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const res = await waFetch(r.apiKey, `/v1/instances/${r.inst.wa_instance_id}/connect`, { method: "POST" });
      if (!res.ok) return json({ error: "wa_service_error", provider_response: res.body }, res.status);
      return json({ success: true, qrcode: res.body });
    }

    // ---------- REFRESH STATUS -------------------------------------------
    if (action === "refresh-status") {
      const cred = await ensure();
      if ("errorResp" in cred) return cred.errorResp;

      const q = supabase.from("whatsapp_instances")
        .select("id, wa_instance_id").eq("company_id", company_id);
      const { data: rows } = body.instance_id ? await q.eq("id", body.instance_id) : await q;

      let updated = 0;
      for (const r of (rows ?? []) as { id: string; wa_instance_id: string | null }[]) {
        if (!r.wa_instance_id) continue;
        const res = await waFetch(cred.apiKey, `/v1/instances/${r.wa_instance_id}/refresh-status`, { method: "POST" });
        if (!res.ok) continue;
        const b = res.body as { status?: string; connected_number?: string | null } | null;
        const state = String(b?.status ?? "unknown").toLowerCase();
        const mapped =
          ["open", "connected", "online"].includes(state)         ? "connected"
          : ["close", "disconnected", "offline"].includes(state)  ? "disconnected"
          : ["connecting", "pairing"].includes(state)             ? "connecting"
          : ["qrcode", "qr"].includes(state)                      ? "qrcode"
          : "unknown";
        await supabase.from("whatsapp_instances").update({
          status: mapped,
          connected_number: b?.connected_number ?? null,
          last_synced_at: new Date().toISOString(),
        }).eq("id", r.id);
        updated++;
      }
      return json({ success: true, updated });
    }

    // ---------- SEND TEST ------------------------------------------------
    if (action === "send-test") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const to = String(body.to ?? "").replace(/\D/g, "");
      if (!to) return json({ error: "Missing to" }, 400);
      const res = await waFetch(r.apiKey,
        `/v1/instances/${r.inst.wa_instance_id}/message/sendText`, {
          method: "POST",
          body: JSON.stringify({
            number: to,
            text: body.message || "Teste de conexão WhatsApp — Zailom Booking ✅",
          }),
        });
      if (!res.ok) return json({ error: "send_failed", provider_response: res.body }, res.status);
      await supabase.rpc("whatsapp_bump_usage", { p_company: company_id });
      return json({ success: true, provider_response: res.body });
    }

    // ---------- TEMPLATES (locais no Booking) ----------------------------
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

    // ---------- SET DEFAULT ----------------------------------------------
    if (action === "set-default-instance") {
      const { instance_id } = body;
      if (!instance_id) return json({ error: "Missing instance_id" }, 400);
      const { error } = await supabase.from("whatsapp_instances")
        .update({ is_default: true }).eq("id", instance_id).eq("company_id", company_id);
      if (error) throw error;
      return json({ success: true });
    }

    // ---------- SETTINGS -------------------------------------------------
    if (action === "get-settings") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const res = await waFetch(r.apiKey, `/v1/instances/${r.inst.wa_instance_id}/settings/find`);
      if (!res.ok) return json({ error: "wa_service_error", provider_response: res.body }, res.status);
      return json({ success: true, settings: res.body });
    }
    if (action === "set-settings") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const s = (body.settings ?? {}) as Record<string, unknown>;
      const payload = {
        rejectCall: !!s.rejectCall,
        msgCall: typeof s.msgCall === "string" ? s.msgCall : "",
        groupsIgnore: !!s.groupsIgnore,
        alwaysOnline: !!s.alwaysOnline,
        readMessages: !!s.readMessages,
        readStatus: !!s.readStatus,
        syncFullHistory: !!s.syncFullHistory,
      };
      const res = await waFetch(r.apiKey, `/v1/instances/${r.inst.wa_instance_id}/settings/set`, {
        method: "POST", body: JSON.stringify(payload),
      });
      if (!res.ok) return json({ error: "wa_service_error", provider_response: res.body }, res.status);
      return json({ success: true, settings: res.body });
    }

    // ---------- WEBHOOK --------------------------------------------------
    if (action === "get-webhook") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const res = await waFetch(r.apiKey, `/v1/instances/${r.inst.wa_instance_id}/webhook/find`);
      if (!res.ok) return json({ error: "wa_service_error", provider_response: res.body }, res.status);
      return json({ success: true, webhook: res.body });
    }
    if (action === "set-webhook") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const w = (body.webhook ?? {}) as Record<string, unknown>;
      const events = Array.isArray(w.events) ? w.events.filter((e) => typeof e === "string") : [];
      const payload = {
        webhook: {
          enabled: !!w.enabled,
          url: typeof w.url === "string" ? w.url : WA_WEBHOOK_URL,
          byEvents: !!w.byEvents,
          base64: !!w.base64,
          events,
        },
      };
      const res = await waFetch(r.apiKey, `/v1/instances/${r.inst.wa_instance_id}/webhook/set`, {
        method: "POST", body: JSON.stringify(payload),
      });
      if (!res.ok) return json({ error: "wa_service_error", provider_response: res.body }, res.status);
      return json({ success: true, webhook: res.body });
    }

    // ---------- PRESENCE / LIFECYCLE -------------------------------------
    if (action === "set-presence") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const presence = String(body.presence ?? "available");
      const res = await waFetch(r.apiKey,
        `/v1/instances/${r.inst.wa_instance_id}/chat/updatePresence`, {
          method: "POST", body: JSON.stringify({ presence }),
        });
      if (!res.ok) return json({ error: "wa_service_error", provider_response: res.body }, res.status);
      return json({ success: true });
    }
    if (action === "logout-instance") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const res = await waFetch(r.apiKey, `/v1/instances/${r.inst.wa_instance_id}/logout`, { method: "POST" });
      if (!res.ok) return json({ error: "wa_service_error", provider_response: res.body }, res.status);
      await supabase.from("whatsapp_instances")
        .update({ status: "disconnected", connected_number: null, last_synced_at: new Date().toISOString() })
        .eq("id", r.inst.id);
      return json({ success: true });
    }
    if (action === "restart-instance") {
      const r = await loadInstance(body.instance_id);
      if ("error" in r) return r.error;
      const res = await waFetch(r.apiKey, `/v1/instances/${r.inst.wa_instance_id}/restart`, { method: "POST" });
      if (!res.ok) return json({ error: "wa_service_error", provider_response: res.body }, res.status);
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    console.error("[whatsapp-integration] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
