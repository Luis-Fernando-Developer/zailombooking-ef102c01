import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ success: false, exists: false }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return respond({ success: false, exists: false }, 500);

    const body = await request.json().catch(() => ({}));
    const slug = String(body?.slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return respond({ success: true, exists: false });
    }

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.from("companies").select("id").eq("slug", slug).maybeSingle();
    if (error) {
      console.error("[validate-company-login-slug] Lookup failed:", error.message);
      return respond({ success: false, exists: false }, 500);
    }
    return respond({ success: true, exists: Boolean(data) });
  } catch (error) {
    console.error("[validate-company-login-slug] Unexpected error:", error);
    return respond({ success: false, exists: false }, 500);
  }
});
