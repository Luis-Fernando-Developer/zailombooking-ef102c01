// Edge function: signup-with-payment
// Versão simplificada (sem pagamento) — apenas cria usuário, company e employee owner.
// O fluxo de pagamento do plano será integrado em outra etapa.

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ ok: false, error: "Configuração do servidor ausente." }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => null);
    if (!body?.company || !body?.password) {
      return json({ ok: false, error: "Payload inválido." }, 400);
    }

    const c = body.company;
    const required = ["name", "slug", "owner_name", "owner_email", "cpf_cnpj"];
    for (const k of required) {
      if (!c[k]) return json({ ok: false, error: `Campo ${k} é obrigatório.` }, 400);
    }

    // 1) Verifica slug livre
    const { data: slugExists } = await admin
      .from("companies")
      .select("id")
      .eq("slug", c.slug)
      .maybeSingle();
    if (slugExists) {
      return json({ ok: false, error: "Esse link personalizado já está em uso." }, 409);
    }

    // 2) Cria usuário no Auth
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: c.owner_email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        name: c.owner_name,
        phone: c.owner_phone,
        role: "owner",
      },
    });

    if (createErr || !created?.user) {
      const msg = (createErr?.message || "").toLowerCase();
      if (msg.includes("already") || createErr?.status === 422) {
        return json(
          { ok: false, error: "Este e-mail já está em uso.", code: "user_already_exists" },
          409,
        );
      }
      return json({ ok: false, error: createErr?.message || "Falha ao criar usuário." }, 400);
    }

    const userId = created.user.id;

    // 3) Cria empresa — tenta com todos os campos e faz fallback removendo
    //    opcionais caso a coluna não exista ou viole CHECK constraint.
    const fullPayload: Record<string, unknown> = {
      name: c.name,
      slug: c.slug,
      owner_name: c.owner_name,
      owner_email: c.owner_email,
      owner_phone: c.owner_phone ?? null,
      owner_cpf: c.cpf_cnpj,
      cnpj: c.cnpj ?? null,
      company_segment: c.company_segment ?? null,
      company_niche: c.company_niche ?? null,
      plan_id: body.plan_id ?? null,
      billing_period: body.billing_period ?? null,
      status: "pending_payment",
    };
    const optionalKeys = [
      "status",
      "billing_period",
      "plan_id",
      "company_niche",
      "company_segment",
      "cnpj",
    ];

    let companyRow: { id: string } | null = null;
    let lastErr: string | null = null;
    const payload: Record<string, unknown> = { ...fullPayload };

    for (let attempt = 0; attempt <= optionalKeys.length; attempt++) {
      const { data, error } = await admin
        .from("companies")
        .insert(payload)
        .select("id")
        .single();
      if (!error && data) {
        companyRow = data;
        break;
      }
      lastErr = error?.message ?? "unknown";
      console.error(`[signup-with-payment] tentativa ${attempt} falhou:`, lastErr);

      const msg = lastErr.toLowerCase();
      const isSchema =
        msg.includes("column") ||
        msg.includes("does not exist") ||
        msg.includes("violates check") ||
        msg.includes("invalid input value");
      if (!isSchema) break;
      const drop = optionalKeys[attempt];
      if (!drop) break;
      delete payload[drop];
    }

    if (!companyRow) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json({ ok: false, error: `Falha ao criar empresa: ${lastErr}` }, 400);
    }

    const companyId = companyRow.id;

    // 4) Cria employee owner — com fallback removendo colunas opcionais
    const empPayload: Record<string, unknown> = {
      company_id: companyId,
      user_id: userId,
      name: c.owner_name,
      email: c.owner_email,
      phone: c.owner_phone ?? null,
      role: "owner",
      employee_type: "owner",
      is_active: true,
    };
    const empOptional = ["employee_type", "phone"];

    let empOk = false;
    let empLastErr: string | null = null;
    for (let i = 0; i <= empOptional.length; i++) {
      const { error: empErr } = await admin.from("employees").insert(empPayload);
      if (!empErr) {
        empOk = true;
        break;
      }
      empLastErr = empErr.message;
      console.error(`[signup-with-payment] employee tentativa ${i} falhou:`, empLastErr);
      const msg = empLastErr.toLowerCase();
      const isSchema =
        msg.includes("column") ||
        msg.includes("does not exist") ||
        msg.includes("violates check") ||
        msg.includes("invalid input value");
      if (!isSchema) break;
      const drop = empOptional[i];
      if (!drop) break;
      delete empPayload[drop];
    }

    if (!empOk) {
      // Rollback completo — sem employee o usuário não consegue logar.
      await admin.from("companies").delete().eq("id", companyId).catch(() => {});
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json(
        { ok: false, error: `Falha ao vincular usuário à empresa: ${empLastErr}` },
        400,
      );
    }

    return json({
      ok: true,
      company_id: companyId,
      user_id: userId,
      message: "Cadastro criado com sucesso.",
    });
  } catch (err) {
    console.error("[signup-with-payment] erro fatal:", err);
    return json({ ok: false, error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
