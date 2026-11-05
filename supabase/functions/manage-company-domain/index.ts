import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const FALLBACK_ORIGIN = "fallback.zailom.com";
const SUPABASE_PROJECT_REF = "pmczddukpylhdeaemmyv";

async function cf(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(CLOUDFLARE_API + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.map((item: any) => item.message).filter(Boolean).join("; ")
      || "Cloudflare HTTP " + response.status;
    throw new Error(message);
  }
  return payload?.result;
}

async function allowAuthRedirect(token: string, domain: string) {
  const endpoint = "https://api.supabase.com/v1/projects/" + SUPABASE_PROJECT_REF + "/config/auth";
  const read = await fetch(endpoint, { headers: { Authorization: "Bearer " + token } });
  if (!read.ok) throw new Error("Não foi possível consultar a configuração Auth do Supabase (HTTP " + read.status + ").");
  const config = await read.json();
  const current = config.uri_allow_list;
  const entries = Array.isArray(current)
    ? current.map((item: unknown) => String(item).trim()).filter(Boolean)
    : String(current || "").split(",").map((item: string) => item.trim()).filter(Boolean);
  const redirect = "https://" + domain + "/**";
  if (entries.includes(redirect)) return;
  entries.push(redirect);
  const update = await fetch(endpoint, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ uri_allow_list: entries.join(",") }),
  });
  if (!update.ok) throw new Error("Não foi possível liberar o domínio no Auth do Supabase (HTTP " + update.status + ").");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sessão não autenticada." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const cfToken = (Deno.env.get("CLOUDFLARE_API_TOKEN") || "").trim();
    const zoneId = (Deno.env.get("CLOUDFLARE_ZONE_ID") || "").trim();
    const managementToken = (Deno.env.get("MANAGEMENT_API_TOKEN") || "").trim();
    if (!supabaseUrl || !anonKey || !serviceKey || !cfToken || !zoneId || !managementToken) {
      return json({ error: "Integração de domínio não configurada. Confira os secrets do Supabase." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return json({ error: "Sessão inválida ou expirada." }, 401);

    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id || "").trim();
    const action = String(body.action || "configure");
    if (!companyId || !["configure", "refresh", "remove"].includes(action)) {
      return json({ error: "Solicitação inválida." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: company, error: companyError } = await admin.from("companies")
      .select("id, owner_email, custom_domain, custom_domain_status, custom_domain_cloudflare_id")
      .eq("id", companyId).maybeSingle();
    if (companyError || !company) return json({ error: "Empresa não encontrada." }, 404);

    const isOwner = Boolean(user.email && company.owner_email &&
      user.email.toLowerCase() === String(company.owner_email).toLowerCase());
    const { data: employee } = await admin.from("employees").select("id, role")
      .eq("company_id", companyId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
    const role = String(employee?.role || "").toLowerCase();
    if (!isOwner && !employee) return json({ error: "Você não tem acesso a esta empresa." }, 403);
    if (!isOwner && !["owner", "admin"].includes(role)) {
      return json({ error: "Somente proprietário ou administrador pode alterar o domínio." }, 403);
    }

    const collection = "/zones/" + zoneId + "/custom_hostnames";
    if (action === "remove") {
      if (company.custom_domain_cloudflare_id) {
        try {
          await cf(cfToken, collection + "/" + company.custom_domain_cloudflare_id, { method: "DELETE" });
        } catch (error) {
          console.warn("[manage-company-domain] remoção Cloudflare:", error);
        }
      }
      const { error } = await admin.from("companies").update({
        booking_url_type: body.booking_url_type === "subdomain" ? "subdomain" : "path",
        booking_subdomain: body.booking_url_type === "subdomain" ? body.booking_subdomain : null,
        custom_domain: null,
        custom_domain_status: "not_configured",
        custom_domain_verified_at: null,
        custom_domain_cloudflare_id: null,
        custom_domain_validation_records: [],
        custom_domain_ownership_verification: null,
        custom_domain_last_error: null,
      }).eq("id", companyId);
      if (error) throw error;
      return json({ success: true, status: "not_configured" });
    }

    const domain = String(company.custom_domain || body.custom_domain || "")
      .trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
      return json({ error: "Informe um domínio válido, como agenda.suaempresa.com.br." }, 400);
    }

    await allowAuthRedirect(managementToken, domain);

    let hostname: any = null;
    if (company.custom_domain_cloudflare_id) {
      try {
        hostname = await cf(cfToken, collection + "/" + company.custom_domain_cloudflare_id);
        if (String(hostname?.hostname || "").toLowerCase() !== domain) hostname = null;
      } catch (error) {
        console.warn("[manage-company-domain] hostname não localizado:", error);
      }
    }
    if (!hostname) {
      hostname = await cf(cfToken, collection, {
        method: "POST",
        body: JSON.stringify({
          hostname: domain,
          custom_origin_server: FALLBACK_ORIGIN,
          ssl: { method: "txt", type: "dv" },
        }),
      });
    }

    const validationRecords = hostname?.ssl?.validation_records || [];
    const ownershipVerification = hostname?.ownership_verification || null;
    const ready = hostname?.status === "active" && hostname?.ssl?.status === "active";
    const status = ready ? "verified" : "pending";
    const { error: saveError } = await admin.from("companies").update({
      booking_url_type: "custom_domain",
      custom_domain: domain,
      custom_domain_status: status,
      custom_domain_verified_at: ready ? new Date().toISOString() : null,
      custom_domain_cloudflare_id: hostname?.id || company.custom_domain_cloudflare_id,
      custom_domain_validation_records: validationRecords,
      custom_domain_ownership_verification: ownershipVerification,
      custom_domain_last_error: null,
    }).eq("id", companyId);
    if (saveError) throw saveError;

    return json({
      success: true,
      domain,
      status,
      cloudflare_status: hostname?.status || "pending",
      ssl_status: hostname?.ssl?.status || "pending",
      cname_target: FALLBACK_ORIGIN,
      validation_records: validationRecords,
      ownership_verification: ownershipVerification,
      message: ready ? "Domínio e certificado HTTPS ativos." : "Aguardando configuração e validação DNS.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao configurar domínio.";
    console.error("[manage-company-domain] erro:", message);
    return json({ error: message }, 500);
  }
});
