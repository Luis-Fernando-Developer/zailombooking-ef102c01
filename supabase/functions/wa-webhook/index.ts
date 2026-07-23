// ============================================================================
// wa-webhook — recebe eventos assinados (HMAC) do wa-service (wa.zailom.com)
// ----------------------------------------------------------------------------
// verify_jwt = false. Auth é feita via HMAC-SHA256 do body cru usando
// WA_WEBHOOK_SIGNING_SECRET (mesmo segredo configurado no wa-service).
// Idempotência via tabela `wa_webhook_deliveries` (chave: X-Zailom-Delivery-Id).
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-zailom-event, x-zailom-delivery-id, x-zailom-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNING_SECRET = Deno.env.get("WA_WEBHOOK_SIGNING_SECRET") ?? "";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifyHmac(bodyBytes: Uint8Array, sigHeader: string): Promise<boolean> {
  if (!SIGNING_SECRET || !sigHeader?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, bodyBytes);
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualStr(`sha256=${hex}`, sigHeader);
}

function mapConnState(v: unknown): "connected" | "disconnected" | "qrcode" | "connecting" | "unknown" {
  const s = String(v ?? "").toLowerCase();
  if (["open", "connected", "online"].includes(s))            return "connected";
  if (["close", "closed", "disconnected", "offline"].includes(s)) return "disconnected";
  if (["connecting", "pairing"].includes(s))                  return "connecting";
  if (["qrcode", "qr", "qr_code"].includes(s))                return "qrcode";
  return "unknown";
}

function normalizeNumber(v: unknown): string | null {
  if (v == null) return null;
  const digits = String(v).split("@")[0].replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function pickNumber(root: unknown): string | null {
  const stack: unknown[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    for (const [k, val] of Object.entries(cur as Record<string, unknown>)) {
      if (/owner|jid|wuid|phone|number/i.test(k)) {
        const n = normalizeNumber(val);
        if (n) return n;
      }
      if (val && typeof val === "object") stack.push(val);
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")     return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const raw = new Uint8Array(await req.arrayBuffer());
  const sig = req.headers.get("X-Zailom-Signature") ?? "";

  if (!(await verifyHmac(raw, sig))) {
    console.warn("[wa-webhook] bad signature");
    return new Response("bad signature", { status: 401, headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response("bad json", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const event = String((body.event as string) ?? req.headers.get("X-Zailom-Event") ?? "").toUpperCase();
  const deliveryId = req.headers.get("X-Zailom-Delivery-Id") ?? crypto.randomUUID();
  const payload = (body.data ?? {}) as Record<string, unknown>;
  const inner = (payload.data ?? {}) as Record<string, unknown>;
  const waInstanceId = String(payload.instance_id ?? "");

  // Resolve company a partir da instance
  let companyId: string | null = null;
  if (waInstanceId) {
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("id, company_id")
      .eq("wa_instance_id", waInstanceId)
      .maybeSingle();
    companyId = (inst as { company_id?: string } | null)?.company_id ?? null;
  }

  // Idempotência
  const { error: dupeErr } = await supabase.from("wa_webhook_deliveries")
    .insert({ delivery_id: deliveryId, company_id: companyId, event });
  if (dupeErr && (dupeErr as { code?: string }).code === "23505") {
    return new Response("ok (dup)", { status: 200, headers: corsHeaders });
  }

  try {
    if (event === "CONNECTION_UPDATE") {
      const state = mapConnState(inner.state ?? inner.status);
      const number = pickNumber(inner);
      const patch: Record<string, unknown> = {
        status: state,
        last_synced_at: new Date().toISOString(),
      };
      if (number) patch.connected_number = number;
      if (state === "disconnected") patch.connected_number = null;
      if (waInstanceId) {
        await supabase.from("whatsapp_instances").update(patch)
          .eq("wa_instance_id", waInstanceId);
      }
    } else if (event === "QRCODE_UPDATED") {
      if (waInstanceId) {
        await supabase.from("whatsapp_instances").update({
          status: "qrcode",
          last_synced_at: new Date().toISOString(),
        }).eq("wa_instance_id", waInstanceId);
      }
    } else if (event === "MESSAGES_UPSERT") {
      // Placeholder: inbox / IA bot pode plugar aqui.
      // Por ora só loga volume.
      console.log("[wa-webhook] MESSAGES_UPSERT", { companyId, waInstanceId });
    }
  } catch (e) {
    console.error("[wa-webhook] handler error:", e);
    // ainda respondemos 200 pra não travar retries do wa-service (é bug nosso).
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
