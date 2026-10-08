import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
      } 
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const internalProvisionSecret = Deno.env.get("INTERNAL_PROVISION_SECRET") ?? "";
    console.log("[AdminCreateUser] Iniciando validação...");

    // 1. Validar Autenticação
    const authHeader = req.headers.get("Authorization");
    let isAuthorized = false;
    let requesterId = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      // Verificar se é a chave de provisionamento interno
      if (internalProvisionSecret !== "" && token === internalProvisionSecret) {
        isAuthorized = true;
        console.log("[AdminCreateUser] Autorizado via INTERNAL_PROVISION_SECRET (global)");
      } else {
        // Verificar se é um JWT de usuário (SuperAdmin)
        try {
          const { data: { user: requester }, error: authError } = await supabaseClient.auth.getUser(token);
          
          if (!authError && requester) {
            requesterId = requester.id;
            // Consultar a tabela super_admins
            const { data: superAdmin, error: dbError } = await supabaseClient
              .from("super_admins")
              .select("*")
              .eq("user_id", requester.id)
              .maybeSingle();

            // Verificar se o registro existe. O campo de ativação pode ser 'active' ou 'is_active'
            const isActive = superAdmin?.active ?? superAdmin?.is_active;

            if (!dbError && superAdmin && isActive !== false) {
              isAuthorized = true;
              console.log(`[AdminCreateUser] Autorizado via SuperAdmin: ${requester.email}`);
            } else {
              console.error(`[AdminCreateUser] Falha na autorização: userFound=${!!superAdmin}, active=${isActive}, dbError=${dbError?.message}`);
            }
          } else if (authError) {
            console.error("[AdminCreateUser] Erro ao validar JWT:", authError.message);
          }
        } catch (e) {
          console.error("[AdminCreateUser] Erro inesperado na validação do token:", e);
        }
      }
    }

    if (!isAuthorized) {
      console.error("[AdminCreateUser] Acesso NEGADO.");
      return new Response(JSON.stringify({ error: "Only active SuperAdmins or valid secret can call this function" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Pegar dados para criação do novo usuário
    const { email, password, metadata } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[AdminCreateUser] Criando usuário: ${email}`);

    // 3. Tentar criar o usuário primeiro
    console.log(`[AdminCreateUser] Tentando criar usuário: ${email}`);
    const { data: createData, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata
    });

    if (createError) {
      console.error("[AdminCreateUser] Erro ao criar usuário:", createError);
      
      let errorMessage = createError.message;
      if (createError.message.toLowerCase().includes("already") || createError.status === 422) {
        // Se o usuário já existir, retornamos um erro 409 (Conflict) específico
        return new Response(JSON.stringify({ 
          error: "Este e-mail já está sendo usado por outro usuário/empresa.",
          code: "user_already_exists"
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Super Admin: provisiona também a assinatura recorrente da empresa criada.
    // Isso mantém o cadastro manual alinhado ao fluxo público /signup.
    let billing: any = null;
    const companyId = metadata?.company_id;
    const planId = metadata?.plan_id;
    const billingPeriod = ["monthly","quarterly","annual"].includes(String(metadata?.billing_period)) ? String(metadata.billing_period) : "monthly";
    const discountPercentage = Math.min(100, Math.max(0, Number(metadata?.discount_percentage ?? 0)));
    const discountCycles = Math.max(0, Math.floor(Number(metadata?.discount_cycles ?? 0)));
    const extraWhatsappInstances = Math.max(0, Math.floor(Number(metadata?.extra_whatsapp_instances ?? 0)));
    if (companyId && requesterId) {
      try {
        const { data: ownerCompany } = await supabaseClient
          .from("companies")
          .select("id, name, owner_name, owner_email, owner_phone, owner_cpf, cnpj, asaas_customer_id, plan_id")
          .eq("id", companyId)
          .maybeSingle();

        if (ownerCompany) {
          const asaaskey = (Deno.env.get("ASAAS_API_KEY") ?? "").trim() ||
            (await supabaseClient
              .from("super_admin_gateway_configs")
              .select("value")
              .eq("provider", "asaas")
              .eq("key", "ASAAS_API_KEY")
              .maybeSingle()).data?.value?.trim();

          if (asaaskey) {
            const isSandbox = asaaskey.includes("hmlg") || !asaaskey.startsWith("$aact_");
            const baseUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://www.asaas.com/api/v3";
            const headers = { access_token: asaaskey, "Content-Type": "application/json" };

            const asaas = async (path: string, init: RequestInit = {}) => {
              const response = await fetch(baseUrl + path, { ...init, headers });
              const raw = await response.text();
              let data: any = {};
              try { data = JSON.parse(raw); } catch {}
              if (!response.ok) {
                throw new Error(data?.errors?.[0]?.description || `Erro Asaas (${response.status})`);
              }
              return data;
            };

            const { data: plan } = await supabaseClient
              .from("subscription_plans")
              .select("*")
              .eq("id", planId ?? ownerCompany.plan_id ?? "")
              .maybeSingle();

            const selectedPlan = plan ?? (await supabaseClient
              .from("subscription_plans")
              .select("*")
              .ilike("name", "starter")
              .limit(1)
              .maybeSingle()).data;

            if (!selectedPlan) throw new Error("Plano selecionado não encontrado.");

            const amount = billingPeriod === "annual" ? Number(selectedPlan.annual_price ?? 0) : billingPeriod === "quarterly" ? Number(selectedPlan.quarterly_price ?? 0) : Number(selectedPlan.monthly_price ?? 0);
            const cpfCnpj = String(ownerCompany.cnpj || ownerCompany.owner_cpf || metadata?.owner_cpf || "").replace(/\D/g, "");
            let customerId = ownerCompany.asaas_customer_id ?? null;

            if (customerId) {
              try {
                const current = await asaas(`/customers/${customerId}`, { method: "GET" });
                if (!current?.id || current?.deleted) customerId = null;
              } catch { customerId = null; }
            }

            if (!customerId && cpfCnpj) {
              const found = await asaas(`/customers?cpfCnpj=${cpfCnpj}`, { method: "GET" });
              customerId = found?.data?.[0]?.id ?? null;
            }

            if (!customerId) {
              const customer = await asaas("/customers", {
                method: "POST",
                body: JSON.stringify({
                  name: ownerCompany.owner_name || ownerCompany.name,
                  email: ownerCompany.owner_email,
                  cpfCnpj: cpfCnpj || undefined,
                  mobilePhone: String(ownerCompany.owner_phone ?? "").replace(/\D/g, "") || undefined,
                  externalReference: `company:${companyId}`,
                }),
              });
              customerId = customer?.id ?? null;
            }

            if (!customerId) throw new Error("Não foi possível criar o cliente no Asaas.");

            const { data: existingSub } = await supabaseClient
              .from("company_subscriptions")
              .select("id, asaas_subscription_id")
              .eq("company_id", companyId)
              .maybeSingle();

            if (!existingSub?.asaas_subscription_id) {
              const { data: invoice, error: invoiceError } = await supabaseClient
                .from("company_invoices")
                .insert({
                  company_id: companyId,
                  amount,
                  status: "pending",
                  due_date: new Date().toISOString().slice(0, 10),
                  description: `Assinatura ZailomBooking - ${selectedPlan.name} (${billingPeriod})`,
                  kind: "subscription",
                  billing_period: billingPeriod,
                  billing_type: "PIX",
                  asaas_customer_id: customerId,
                })
                .select("id")
                .single();

              if (invoiceError || !invoice) throw new Error(invoiceError?.message || "Falha ao criar fatura local.");

              let subscription: any;
              try {
                subscription = await asaas("/subscriptions", {
                  method: "POST",
                  body: JSON.stringify({
                    customer: customerId,
                    billingType: "PIX",
                    value: amount,
                    nextDueDate: new Date().toISOString().slice(0, 10),
                    cycle: billingPeriod === "annual" ? "YEARLY" : billingPeriod === "quarterly" ? "QUARTERLY" : "MONTHLY",
                    description: `ZailomBooking ${selectedPlan.name} - ${billingPeriod}`,
                    externalReference: `subscription:${invoice.id}:${companyId}`,
                  }),
                });
              } catch (error) {
                await supabaseClient.from("company_invoices").delete().eq("id", invoice.id);
                throw error;
              }

              const subscriptionId = subscription?.id ?? null;
              if (!subscriptionId) throw new Error("Asaas não retornou o ID da assinatura.");

              let firstPayment: any = null;
              for (let attempt = 0; attempt < 3 && !firstPayment; attempt++) {
                const payments = await asaas(`/subscriptions/${subscriptionId}/payments`, { method: "GET" });
                firstPayment = payments?.data?.[0] ?? null;
                if (!firstPayment && attempt < 2) await new Promise(resolve => setTimeout(resolve, 500));
              }

              await supabaseClient.from("companies").update({
                asaas_customer_id: customerId,
                asaas_subscription_id: subscriptionId,
                plan_id: selectedPlan.id,
                billing_period: billingPeriod,
              }).eq("id", companyId);

              const now = new Date();
              const nextBilling = new Date(now);
              nextBilling.setMonth(nextBilling.getMonth() + 1);

              await supabaseClient.from("company_subscriptions").insert({
                company_id: companyId,
                plan_id: selectedPlan.id,
                billing_period: billingPeriod,
                status: discountPercentage === 100 ? "active" : "pending",
                billing_status: discountPercentage === 100 ? "active" : "suspended",
                cycle_start_at: now.toISOString(),
                next_renewal_at: nextBilling.toISOString(),
                next_billing_date: nextBilling.toISOString(),
                asaas_subscription_id: subscriptionId,
                original_price: amount,
                discount_percentage: discountPercentage,
                discount_cycles_remaining: discountCycles,
                extra_whatsapp_instances: extraWhatsappInstances,
                manual_admin_created: true,
              });

              await supabaseClient.from("company_invoices").update({
                asaas_payment_id: firstPayment?.id ?? null,
                asaas_customer_id: customerId,
                invoice_url: firstPayment?.invoiceUrl ?? null,
                bank_slip_url: firstPayment?.bankSlipUrl ?? null,
                updated_at: new Date().toISOString(),
              }).eq("id", invoice.id);

              billing = {
                subscription_id: subscriptionId,
                invoice_id: invoice.id,
                asaas_payment_id: firstPayment?.id ?? null,
                amount,
                billing_period: "monthly",
                billing_type: "PIX",
                environment: isSandbox ? "sandbox" : "production",
              };
            }
          }
        }
      } catch (billingError) {
        console.error("[AdminCreateUser] Erro ao provisionar assinatura Asaas:", billingError);
        billing = { error: billingError instanceof Error ? billingError.message : "Erro ao criar assinatura." };
      }
    }

    return new Response(JSON.stringify({ user: createData.user, billing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[AdminCreateUser] Erro fatal:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
