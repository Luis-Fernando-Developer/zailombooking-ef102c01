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

    // A credencial empresarial usa bcrypt/pgcrypto, cujo limite é 72 bytes.
    // Validamos antes do RPC para evitar que o erro interno do hash chegue ao cliente.
    if (typeof password !== "string") {
      return new Response(JSON.stringify({ error: "A senha do proprietário é inválida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const passwordBytes = new TextEncoder().encode(password).length;
    if (passwordBytes > 72) {
      return new Response(JSON.stringify({
        error: "A senha do proprietário deve ter no máximo 72 bytes.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({
        error: "A senha do proprietário deve ter pelo menos 6 caracteres.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[AdminCreateUser] Criando usuário: ${email}`);

    // 3. A identidade Auth é GLOBAL. A senha empresarial NÃO é a senha do Auth.
    // Procuramos primeiro pelo user_id informado; se não houver, pelo e-mail.
    // Assim o mesmo empreendedor pode possuir várias empresas com senhas diferentes.
    let existingUserId = metadata?.existing_user_id ?? null;
    if (!existingUserId) {
      const { data: foundUserId } = await supabaseClient.rpc("get_user_id_by_email", { _email: email });
      existingUserId = foundUserId ?? null;
    }

    let createData: any;
    let createdNewAuthUser = false;

    if (existingUserId) {
      const { data: existingAuth, error: existingAuthError } = await supabaseClient.auth.admin.getUserById(existingUserId);
      if (existingAuthError || !existingAuth?.user) {
        return new Response(JSON.stringify({ error: "Não foi possível localizar o usuário existente." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if ((existingAuth.user.email ?? "").trim().toLowerCase() !== email.trim().toLowerCase()) {
        return new Response(JSON.stringify({ error: "O usuário existente não corresponde ao e-mail informado." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      createData = { user: existingAuth.user };
      console.log(`[AdminCreateUser] Reutilizando identidade Auth existente: ${existingAuth.user.id}`);
    } else {
      console.log(`[AdminCreateUser] Criando identidade Auth global para: ${email}`);
      // A identidade global NÃO recebe a senha empresarial.
      // O acesso do proprietário é contextual por empresa e fica em employees.password_hash,
      // exatamente como o fluxo de identidade sem senha usado para clientes multiempresa.
      const { data: newUserData, error: createError } = await supabaseClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: metadata
      });

      if (createError || !newUserData?.user) {
        console.error("[AdminCreateUser] Erro ao criar identidade:", createError);
        return new Response(JSON.stringify({ error: createError?.message || "Falha ao criar usuário." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      createdNewAuthUser = true;
      createData = newUserData;
    }

    // A senha informada pelo Super Admin é armazenada SOMENTE como credencial
    // contextual da empresa, com hash pgcrypto. O Auth nunca é alterado com ela.
    const companyIdForAccess = metadata?.company_id;
    if (!companyIdForAccess) {
      if (createdNewAuthUser) await supabaseClient.auth.admin.deleteUser(createData.user.id).catch(() => {});
      return new Response(JSON.stringify({ error: "company_id é obrigatório para criar o acesso empresarial." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ownerAccess, error: ownerAccessError } = await supabaseClient.rpc("create_owner_company_credential", {
      p_user_id: createData.user.id,
      p_company_id: companyIdForAccess,
      p_email: email,
      p_password: password,
      p_name: metadata?.owner_name ?? "",
      p_phone: metadata?.owner_phone ?? null,
    });

    if (ownerAccessError || !ownerAccess?.success) {
      if (createdNewAuthUser) await supabaseClient.auth.admin.deleteUser(createData.user.id).catch(() => {});
      return new Response(JSON.stringify({ error: ownerAccess?.error || ownerAccessError?.message || "Não foi possível criar a credencial empresarial." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirmação é por empresa, não por identidade global.
    const siteUrl = (Deno.env.get("SITE_URL") || "https://booking.zailom.com").replace(/\/$/, "");
    const confirmationLink = `${siteUrl}/confirmar-empresa?token=${ownerAccess.confirmation_token}`;
    const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    if (resendKey) {
      const from = (Deno.env.get("BILLING_EMAIL_FROM") || Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Zailom Booking — confirme o acesso à sua empresa",
          html: `<h2>Olá, ${metadata?.owner_name || "empreendedor"}!</h2><p>Seu acesso à empresa foi criado no Zailom Booking.</p><p>Esta senha é exclusiva desta empresa e pode ser diferente da senha usada em outras empresas.</p><p><a href="${confirmationLink}">Confirmar meu acesso empresarial</a></p>`,
        }),
      }).catch((e) => console.error("[AdminCreateUser] Erro ao enviar confirmação:", e));
    }

    // Super Admin: provisiona também a assinatura recorrente da empresa criada.
    // Isso mantém o cadastro manual alinhado ao fluxo público /signup.
    let billing: any = null;
    const companyId = metadata?.company_id;
    const planId = metadata?.plan_id;
    const billingPeriod = ["monthly","quarterly","annual"].includes(String(metadata?.billing_period)) ? String(metadata.billing_period) : "monthly";
    const discountPercentage = Math.min(100, Math.max(0, Number(metadata?.discount_percentage ?? 0)));
    const discountCycles = discountPercentage > 0 ? Math.max(1, Math.floor(Number(metadata?.discount_cycles ?? 1))) : 0;
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

            const selectedPlan = plan;
            if (!selectedPlan) throw new Error("Plano selecionado não encontrado.");

            const amount = billingPeriod === "annual" ? Number(selectedPlan.annual_price ?? 0) : billingPeriod === "quarterly" ? Number(selectedPlan.quarterly_price ?? 0) : Number(selectedPlan.monthly_price ?? 0);
            const discountedAmount = Number((amount * (1 - discountPercentage / 100)).toFixed(2));
            if (!(amount > 0)) throw new Error("Valor do plano inválido.");
            const cpfCnpj = String(ownerCompany.cnpj || ownerCompany.owner_cpf || metadata?.owner_cpf || "").replace(/\D/g, "");
            // O cliente Asaas é vinculado à EMPRESA, não ao CPF/e-mail do proprietário.
            // O mesmo empresário pode possuir várias empresas, portanto não reutilizamos
            // um cliente encontrado apenas por CPF/CNPJ ou e-mail.
            let customerId = ownerCompany.asaas_customer_id ?? null;

            if (customerId) {
              try {
                const current = await asaas(`/customers/${customerId}`, { method: "GET" });
                if (!current?.id || current?.deleted) customerId = null;
              } catch { customerId = null; }
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
                  amount: discountPercentage === 100 ? 0 : discountedAmount,
                  status: discountPercentage === 100 ? "cancelled" : "pending",
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
                    nextDueDate: discountPercentage === 100 && discountCycles === 0
                      ? new Date(Date.now() + (billingPeriod === "annual" ? 365 : billingPeriod === "quarterly" ? 90 : 30) * 86400000).toISOString().slice(0, 10)
                      : new Date().toISOString().slice(0, 10),
                    cycle: billingPeriod === "annual" ? "YEARLY" : billingPeriod === "quarterly" ? "QUARTERLY" : "MONTHLY",
                    ...(discountPercentage > 0 && discountCycles > 0 ? { discount: { value: discountPercentage, type: "PERCENTAGE", limitDate: new Date(Date.now() + (billingPeriod === "annual" ? 365 : billingPeriod === "quarterly" ? 90 : 30) * discountCycles * 86400000).toISOString().slice(0, 10), dueDateLimitDays: 0 } } : {}),
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
              for (let attempt = 0; attempt < 10 && !firstPayment; attempt++) {
                const payments = await asaas(`/subscriptions/${subscriptionId}/payments`, { method: "GET" });
                firstPayment = payments?.data?.[0] ?? null;
                if (firstPayment?.id && discountPercentage > 0 && discountCycles === 0 && discountPercentage < 100) {
                  firstPayment = await asaas(`/payments/${firstPayment.id}`, { method: "PUT", body: JSON.stringify({ value: discountedAmount }) });
                }
                if (!firstPayment && attempt < 9) await new Promise(resolve => setTimeout(resolve, 1000));
              }

              await supabaseClient.from("companies").update({
                asaas_customer_id: customerId,
                asaas_subscription_id: subscriptionId,
                plan_id: selectedPlan.id,
                billing_period: billingPeriod,
                extra_whatsapp_instances: extraWhatsappInstances,
                status: discountPercentage === 100 ? "active" : "pending_payment",
              }).eq("id", companyId);

              const now = new Date();
              const nextBilling = new Date(now);
              if (billingPeriod === "annual") nextBilling.setFullYear(nextBilling.getFullYear() + 1);
              else if (billingPeriod === "quarterly") nextBilling.setMonth(nextBilling.getMonth() + 3);
              else nextBilling.setMonth(nextBilling.getMonth() + 1);

              const { data: localSub, error: localSubError } = await supabaseClient
                .from("company_subscriptions")
                .insert({
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
                  manual_admin_created: true,
                })
                .select("id")
                .single();
              if (localSubError || !localSub) throw localSubError || new Error("Falha ao salvar assinatura local.");

              await supabaseClient.from("company_invoices").update({
                subscription_id: localSub.id,
                amount: discountPercentage === 100 ? 0 : Number(firstPayment?.value ?? discountedAmount),
                asaas_payment_id: firstPayment?.id ?? null,
                asaas_customer_id: customerId,
                invoice_url: firstPayment?.invoiceUrl ?? null,
                bank_slip_url: firstPayment?.bankSlipUrl ?? null,
                updated_at: new Date().toISOString(),
              }).eq("id", invoice.id);

              // 1) Confirmação do cadastro.
              // 2) Cobrança residual em um segundo e-mail, quando houver.
              let emailSent = false;
              let emailError: string | null = null;
              const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
              if (resendKey) {
                const from = (Deno.env.get("BILLING_EMAIL_FROM") ||
                  Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") ||
                  "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();

                const confirmationResponse = await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + resendKey },
                  body: JSON.stringify({
                    from,
                    to: [ownerCompany.owner_email],
                    subject: "Zailom Booking — cadastro confirmado",
                    html: "<h2>Cadastro confirmado</h2><p>Olá, " + (ownerCompany.owner_name || "empreendedor") + "!</p><p>A empresa <strong>" + ownerCompany.name + "</strong> foi cadastrada no Zailom Booking.</p><p>Plano: <strong>" + selectedPlan.name + "</strong> · Ciclo: <strong>" + billingPeriod + "</strong>.</p>" +
                      (discountPercentage === 100 ? "<p>Seu desconto é de 100%, portanto não há cobrança residual para ativação.</p>" : "<p>O acesso será liberado automaticamente após a confirmação do pagamento da cobrança enviada em seguida.</p>"),
                  }),
                });

                emailSent = confirmationResponse.ok;
                if (!confirmationResponse.ok) emailError = await confirmationResponse.text();

                if (discountPercentage < 100 && firstPayment?.id) {
                  const paymentLink = firstPayment.invoiceUrl || firstPayment.bankSlipUrl || "";
                  const chargeValue = Number(firstPayment.value ?? discountedAmount);
                  const billingResponse = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + resendKey },
                    body: JSON.stringify({
                      from,
                      to: [ownerCompany.owner_email],
                      subject: "Zailom Booking — cobrança para ativação",
                      html: "<h2>Cobrança para ativação</h2><p>Olá, " + (ownerCompany.owner_name || "empreendedor") + "!</p><p>Valor para ativar a empresa <strong>" + ownerCompany.name + "</strong>: <strong>R$ " + chargeValue.toFixed(2).replace(".", ",") + "</strong>.</p>" +
                        (paymentLink ? "<p><a href='" + paymentLink + "'>Acessar cobrança e pagar</a></p>" : "") +
                        "<p>Após a confirmação do pagamento, a conta será ativada automaticamente.</p>",
                    }),
                  });
                  if (!billingResponse.ok && !emailError) emailError = await billingResponse.text();
                }
              } else {
                emailError = "RESEND_API_KEY não configurada.";
              }

              billing = {
                subscription_id: subscriptionId,
                invoice_id: invoice.id,
                asaas_payment_id: firstPayment?.id ?? null,
                amount,
                billing_period: billingPeriod,
                  billing_type: "PIX",
                environment: isSandbox ? "sandbox" : "production",
                email_sent: emailSent,
                email_error: emailError,
                discount_percentage: discountPercentage,
                discount_cycles: discountCycles,
                extra_whatsapp_instances: extraWhatsappInstances,
              };
            }
          }
        }
      } catch (billingError) {
        console.error("[AdminCreateUser] Erro ao provisionar assinatura Asaas:", billingError);
        billing = { error: billingError instanceof Error ? billingError.message : "Erro ao criar assinatura." };
      }
    }

    return new Response(JSON.stringify({ user: createData.user, owner_employee_id: ownerAccess.employee_id, billing }), {
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
