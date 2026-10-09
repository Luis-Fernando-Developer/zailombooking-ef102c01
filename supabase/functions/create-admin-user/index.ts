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
    const { email, metadata } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pré-validação antes de criar credenciais ou enviar e-mails; a reserva atômica
    // e definitiva ocorre depois, no provisionamento da assinatura.
    const requestedCouponCode = String(metadata?.coupon_code ?? "").trim().toUpperCase();
    if (requestedCouponCode) {
      if (Number(metadata?.discount_percentage ?? 0) > 0) {
        return new Response(JSON.stringify({ error: "Cupom de aquisição não pode ser acumulado com desconto manual." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const requestedPeriod = ["monthly","quarterly","annual"].includes(String(metadata?.billing_period)) ? String(metadata.billing_period) : "monthly";
      const { data: requestedPlan } = await supabaseClient.from("subscription_plans")
        .select("id,monthly_price,quarterly_price,annual_price")
        .eq("id", metadata?.plan_id ?? "").maybeSingle();
      const { data: requestedCoupon, error: requestedCouponError } = await supabaseClient.from("subscription_coupons")
        .select("id,is_active,discount_type,discount_value,plan_ids,billing_periods,starts_at,expires_at,max_redemptions")
        .eq("code", requestedCouponCode).maybeSingle();
      let couponValidationError: string | null = null;
      if (requestedCouponError) couponValidationError = "Não foi possível validar o cupom.";
      else if (!requestedCoupon || !requestedCoupon.is_active) couponValidationError = "Cupom inválido ou inativo.";
      else if (requestedCoupon.starts_at && Date.now() < new Date(requestedCoupon.starts_at).getTime()) couponValidationError = "Este cupom ainda não está válido.";
      else if (requestedCoupon.expires_at && Date.now() > new Date(requestedCoupon.expires_at).getTime()) couponValidationError = "Este cupom expirou.";
      else if ((requestedCoupon.plan_ids || []).length && !requestedCoupon.plan_ids.includes(String(metadata?.plan_id ?? ""))) couponValidationError = "Este cupom não é válido para o plano selecionado.";
      else if (!(requestedCoupon.billing_periods || []).includes(requestedPeriod)) couponValidationError = "Este cupom não é válido para o período selecionado.";
      if (!couponValidationError && requestedCoupon?.max_redemptions != null) {
        const { count, error: usageError } = await supabaseClient.from("subscription_coupon_redemptions")
          .select("id", { count: "exact", head: true }).eq("coupon_id", requestedCoupon.id).in("status", ["reserved","applied","paid"]);
        if (usageError) couponValidationError = "Não foi possível verificar o limite deste cupom.";
        else if ((count || 0) >= requestedCoupon.max_redemptions) couponValidationError = "Este cupom atingiu o limite de utilizações.";
      }
      if (!requestedPlan) couponValidationError = "Plano selecionado não encontrado.";
      if (!couponValidationError && requestedCoupon && requestedPlan) {
        const originalAmount = requestedPeriod === "annual" ? Number(requestedPlan.annual_price || 0) : requestedPeriod === "quarterly" ? Number(requestedPlan.quarterly_price || 0) : Number(requestedPlan.monthly_price || 0);
        const discountAmount = requestedCoupon.discount_type === "percentage"
          ? Number((originalAmount * Math.min(100, Number(requestedCoupon.discount_value)) / 100).toFixed(2))
          : Math.min(originalAmount, Number(requestedCoupon.discount_value));
        if (!(originalAmount > 0) || Number((originalAmount - discountAmount).toFixed(2)) <= 0) couponValidationError = "O desconto não pode zerar a cobrança do Asaas.";
      }
      if (couponValidationError) {
        return new Response(JSON.stringify({ error: couponValidationError }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
      p_password: null,
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

    // E-mail 1: apenas notificação do cadastro. O link para criar senha
    // será enviado pelo webhook somente após a confirmação do pagamento.
    const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    if (resendKey) {
      const from = (Deno.env.get("BILLING_EMAIL_FROM") || Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") || "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Zailom Booking — cadastro da empresa recebido",
          html: `<h2>Olá, ${metadata?.owner_name || "empreendedor"}!</h2><p>O cadastro da sua empresa foi recebido no Zailom Booking.</p><p>O próximo e-mail conterá a cobrança do plano escolhido. Após a confirmação do pagamento, enviaremos o link para validar seu e-mail e criar a senha empresarial.</p>`,
        }),
      }).catch((e) => console.error("[AdminCreateUser] Erro ao enviar aviso de cadastro:", e));
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
    let reservedCouponId: string | null = null;
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
            let couponReservation: any = null;
            const couponCode = String(metadata?.coupon_code ?? "").trim().toUpperCase();
            if (couponCode) {
              if (discountPercentage > 0) throw new Error("Cupom de aquisição não pode ser acumulado com desconto manual.");
              const { data: reserved, error: reserveError } = await supabaseClient.rpc("reserve_subscription_coupon", {
                _code: couponCode,
                _company_id: companyId,
                _plan_id: selectedPlan.id,
                _billing_period: billingPeriod,
                _original_amount: amount,
              });
              if (reserveError || !reserved) throw new Error(reserveError?.message || "Não foi possível validar/reservar o cupom.");
              couponReservation = reserved;
              reservedCouponId = String(reserved.redemption_id);
            }
            const discountedAmount = couponReservation
              ? Number(couponReservation.discounted_amount)
              : Number((amount * (1 - discountPercentage / 100)).toFixed(2));
            if (!(amount > 0)) throw new Error("Valor do plano inválido.");
            if (discountedAmount <= 0) throw new Error("O cupom não pode zerar a cobrança do Asaas.");
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
                  amount: discountedAmount,
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
                    nextDueDate: discountPercentage === 100 && discountCycles === 0
                      ? new Date(Date.now() + (billingPeriod === "annual" ? 365 : billingPeriod === "quarterly" ? 90 : 30) * 86400000).toISOString().slice(0, 10)
                      : new Date().toISOString().slice(0, 10),
                    cycle: billingPeriod === "annual" ? "YEARLY" : billingPeriod === "quarterly" ? "QUARTERLY" : "MONTHLY",
                    ...(couponReservation && Number(couponReservation.duration_cycles) > 1 ? {
                      discount: {
                        value: Number(couponReservation.discount_value),
                        type: couponReservation.discount_type === "percentage" ? "PERCENTAGE" : "FIXED",
                        limitDate: (() => { const d = new Date(); const n = Math.max(0, Number(couponReservation.duration_cycles) - 1); if (billingPeriod === "annual") d.setFullYear(d.getFullYear() + n); else if (billingPeriod === "quarterly") d.setMonth(d.getMonth() + n * 3); else d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); })(),
                        dueDateLimitDays: 0,
                      },
                    } : discountPercentage > 0 && discountCycles > 0 ? { discount: { value: discountPercentage, type: "PERCENTAGE", limitDate: new Date(Date.now() + (billingPeriod === "annual" ? 365 : billingPeriod === "quarterly" ? 90 : 30) * discountCycles * 86400000).toISOString().slice(0, 10), dueDateLimitDays: 0 } } : {}),
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
                if (firstPayment?.id && couponReservation && Math.abs(Number(firstPayment.value ?? amount) - discountedAmount) >= 0.01) {
                  try {
                    const adjustedPayment = await asaas(`/payments/${firstPayment.id}`, { method: "PUT", body: JSON.stringify({ value: discountedAmount }) });
                    firstPayment = { ...firstPayment, ...adjustedPayment, value: discountedAmount };
                  } catch (adjustError) {
                    await asaas(`/subscriptions/${subscriptionId}`, { method: "DELETE" }).catch(() => {});
                    throw adjustedError;
                  }
                } else if (firstPayment?.id && discountPercentage > 0 && discountCycles === 0 && discountPercentage < 100) {
                  const adjustedPayment = await asaas(`/payments/${firstPayment.id}`, { method: "PUT", body: JSON.stringify({ value: discountedAmount }) });
                  firstPayment = { ...firstPayment, ...adjustedPayment, value: discountedAmount };
                }
                if (!firstPayment && attempt < 9) await new Promise(resolve => setTimeout(resolve, 1000));
              }
              if (couponReservation && !firstPayment) {
                await asaas(`/subscriptions/${subscriptionId}`, { method: "DELETE" }).catch(() => {});
                throw new Error("O Asaas não gerou a primeira cobrança com o cupom. A assinatura foi cancelada para evitar cobrança pelo valor integral.");
              }

              await supabaseClient.from("companies").update({
                asaas_customer_id: customerId,
                asaas_subscription_id: subscriptionId,
                plan_id: selectedPlan.id,
                billing_period: billingPeriod,
                extra_whatsapp_instances: extraWhatsappInstances,
                status: "pending_payment",
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
                  status: "pending",
                  billing_status: "suspended",
                  cycle_start_at: now.toISOString(),
                  next_renewal_at: nextBilling.toISOString(),
                  next_billing_date: nextBilling.toISOString(),
                  asaas_subscription_id: subscriptionId,
                  original_price: amount,
                  discount_percentage: couponReservation ? 0 : discountPercentage,
                  discount_cycles_remaining: couponReservation ? 0 : discountCycles,
                  ...(couponReservation ? {
                    coupon_id: couponReservation.coupon_id,
                    coupon_code: couponReservation.code,
                    coupon_discount_type: couponReservation.discount_type,
                    coupon_discount_value: Number(couponReservation.discount_value),
                    coupon_cycles_remaining: Number(couponReservation.duration_cycles),
                  } : {}),
                  manual_admin_created: true,
                })
                .select("id")
                .single();
              if (localSubError || !localSub) throw localSubError || new Error("Falha ao salvar assinatura local.");

              await supabaseClient.from("company_invoices").update({
                subscription_id: localSub.id,
                amount: discountedAmount,
                metadata: couponReservation ? { coupon_id: couponReservation.coupon_id, coupon_code: couponReservation.code, original_amount: amount, discount_amount: Number(couponReservation.discount_amount), discounted_amount: discountedAmount, discount_type: couponReservation.discount_type, discount_value: Number(couponReservation.discount_value), duration_cycles: Number(couponReservation.duration_cycles) } : {},
                asaas_payment_id: firstPayment?.id ?? null,
                asaas_customer_id: customerId,
                invoice_url: firstPayment?.invoiceUrl ?? null,
                bank_slip_url: firstPayment?.bankSlipUrl ?? null,
                updated_at: new Date().toISOString(),
              }).eq("id", invoice.id);
              if (couponReservation) {
                await supabaseClient.from("subscription_coupon_redemptions").update({
                  subscription_id: localSub.id,
                  invoice_id: invoice.id,
                  status: "applied",
                  updated_at: new Date().toISOString(),
                }).eq("id", couponReservation.redemption_id);
              }

              // O e-mail 1 (cadastro recebido) já foi enviado antes da cobrança.
              // Aqui enviamos somente o e-mail 2 e, no desconto integral, o e-mail 3.
              let emailSent = false;
              let emailError: string | null = null;
              const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
              if (resendKey) {
                const from = (Deno.env.get("BILLING_EMAIL_FROM") ||
                  Deno.env.get("CLIENT_ACCESS_EMAIL_FROM") ||
                  "Zailom Booking <atendimento@suport-mail.booking.zailom.com>").trim();

                if (discountPercentage < 100 && firstPayment?.id) {
                  const paymentLink = firstPayment.invoiceUrl || firstPayment.bankSlipUrl || "";
                  const chargeValue = discountedAmount;
                  const billingResponse = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + resendKey },
                    body: JSON.stringify({
                      from,
                      to: [ownerCompany.owner_email],
                      subject: "Zailom Booking — cobrança para ativação",
                      html: "<h2>Cobrança para ativação</h2><p>Olá, " + (ownerCompany.owner_name || "empreendedor") + "!</p><p>Valor para ativar a empresa <strong>" + ownerCompany.name + "</strong>: <strong>R$ " + chargeValue.toFixed(2).replace(".", ",") + "</strong>.</p>" +
                        (paymentLink ? "<p><a href='" + paymentLink + "'>Acessar cobrança e pagar</a></p>" : "") +
                        "<p>Após a confirmação do pagamento, enviaremos um novo e-mail para confirmar o endereço e criar a senha empresarial.</p>",
                    }),
                  });
                  emailSent = billingResponse.ok;
                  if (!billingResponse.ok) emailError = await billingResponse.text();
                } else if (discountPercentage === 100) {
                  const setupLink = (Deno.env.get("SITE_URL") || "https://booking.zailom.com").replace(/\/$/, "") + "/confirmar-empresa?token=" + ownerAccess.confirmation_token;
                  const zeroChargeResponse = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + resendKey },
                    body: JSON.stringify({
                      from,
                      to: [ownerCompany.owner_email],
                      subject: "Zailom Booking — cobrança de ativação zerada",
                      html: "<h2>Seu desconto cobriu 100% do plano!</h2><p>A cobrança de ativação da empresa <strong>" + ownerCompany.name + "</strong> ficou em <strong>R$ 0,00</strong>. Não é necessário pagar uma cobrança.</p><p>Enviaremos em seguida as instruções para concluir a ativação.</p>",
                    }),
                  });
                  const setupResponse = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + resendKey },
                    body: JSON.stringify({
                      from,
                      to: [ownerCompany.owner_email],
                      subject: "Zailom Booking — confirme seu e-mail e crie sua senha",
                      html: "<h2>Conclua a ativação da sua empresa</h2><p>Como o desconto especial zerou a cobrança, você já pode concluir a ativação da empresa <strong>" + ownerCompany.name + "</strong>.</p><p><a href='" + setupLink + "'>Confirmar e criar minha senha empresarial</a></p>",
                    }),
                  });
                  emailSent = zeroChargeResponse.ok && setupResponse.ok;
                  if (!setupResponse.ok) emailError = await setupResponse.text();
                  if (!zeroChargeResponse.ok && !emailError) emailError = await zeroChargeResponse.text();
                  if (setupResponse.ok) {
                    await supabaseClient.from("owner_company_confirmations")
                      .update({ password_setup_email_sent_at: new Date().toISOString() })
                      .eq("company_id", companyId);
                  }
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
                coupon: couponReservation ? { code: couponReservation.code, discount_amount: Number(couponReservation.discount_amount), discounted_amount: discountedAmount, duration_cycles: Number(couponReservation.duration_cycles) } : null,
                extra_whatsapp_instances: extraWhatsappInstances,
              };
            }
          }
        }
      } catch (billingError) {
        if (reservedCouponId) {
          await supabaseClient.from("subscription_coupon_redemptions")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", reservedCouponId);
        }
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
