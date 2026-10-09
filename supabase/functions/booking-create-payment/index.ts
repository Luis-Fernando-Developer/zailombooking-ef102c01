import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

serve(async (req) => {
  // 1. Resposta rápida para preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
    )

    // A função é chamada pelo navegador. O preflight não passa pelo verify_jwt da plataforma,
    // então a autenticação do POST é validada aqui.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    const apiKeyHeader = (req.headers.get('apikey') ?? '').trim()
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()

    // public-api uses a service-role Supabase client to invoke this function.
    // Depending on the Functions client/runtime, the service-role credential can
    // arrive as apikey instead of Authorization. Trust only the exact secret.
    const isTrustedInternalCall = Boolean(
      serviceRoleKey &&
      ((jwt && jwt === serviceRoleKey) || (apiKeyHeader && apiKeyHeader === serviceRoleKey))
    )

    if (!jwt && !isTrustedInternalCall) {
      return new Response(JSON.stringify({ error: 'Sessão não autenticada.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }
    const { data: authData, error: authError } = isTrustedInternalCall
      ? { data: { user: null }, error: null }
      : await supabaseClient.auth.getUser(jwt)

    if (!isTrustedInternalCall && (authError || !authData?.user)) {
      console.error('[BOOKING_PAYMENT] Auth error:', authError?.message)
      return new Response(JSON.stringify({ error: 'Sessão inválida ou expirada.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 2. Extração do corpo com log básico
    const rawBody = await req.text()
    console.log('[BOOKING_PAYMENT] Request body:', rawBody)
    
    let body
    try {
      body = JSON.parse(rawBody)
    } catch (e) {
      throw new Error('Corpo da requisição inválido')
    }

    const { booking_id, method, payer, amount: bodyAmount, bookingData, hold_id } = body
    const couponCode = String(body.coupon_code ?? '').trim().toUpperCase() || null

    // --- RESOLUÇÃO DO CONTEXTO ---
    // Online: o booking definitivo ainda não existe. Quando o consumidor
    // envia apenas hold_id, o próprio hold é a fonte de verdade para empresa,
    // cliente, profissional, serviço, data e horário.
    let resolvedBookingId: string | undefined = booking_id || undefined
    let booking: any = null
    let companyId: string | undefined = undefined
    let resolvedBookingData: Record<string, any> | null =
      bookingData && typeof bookingData === 'object' ? { ...(bookingData as Record<string, any>) } : null

    if (resolvedBookingId) {
      const { data: existingBooking, error: bErr } = await supabaseClient
        .from('bookings')
        .select('*, company:companies(*)')
        .eq('id', resolvedBookingId)
        .single()

      if (bErr || !existingBooking) throw new Error('Agendamento não encontrado')
      booking = existingBooking
      companyId = String(existingBooking.company_id)
    } else if (resolvedBookingData) {
      const bd = resolvedBookingData
      const required = ['company_id', 'client_id', 'employee_id', 'booking_date', 'booking_time']
      const missing = required.filter((f) => !bd[f])
      if (missing.length) {
        throw new Error(`bookingData campos obrigatórios faltando: ${missing.join(', ')}`)
      }
      companyId = String(bd.company_id)
    } else if (hold_id) {
      // Contrato público simplificado: hold_id + method é suficiente.
      // O hold já contém todo o contexto necessário para o checkout.
      const { data: hold, error: holdError } = await supabaseClient
        .from('booking_slot_holds')
        .select('id, company_id, employee_id, service_id, client_id, booking_date, booking_time, start_time, end_time, expires_at, status')
        .eq('id', hold_id)
        .maybeSingle();

      if (holdError || !hold) throw new Error('Reserva temporária do horário não encontrada.');
      if (hold.status !== 'active' || new Date(hold.expires_at).getTime() <= Date.now()) {
        throw new Error('O tempo para concluir a reserva acabou. O horário foi liberado.');
      }

      if (!hold.service_id) {
        throw new Error('O serviço da reserva temporária não foi identificado.');
      }

      const { data: service, error: serviceError } = await supabaseClient
        .from('services')
        .select('id, price')
        .eq('id', hold.service_id)
        .eq('company_id', hold.company_id)
        .maybeSingle();

      if (serviceError || !service) {
        throw new Error('Serviço da reserva temporária não encontrado.');
      }

      companyId = String(hold.company_id)
      resolvedBookingData = {
        company_id: hold.company_id,
        client_id: hold.client_id,
        employee_id: hold.employee_id,
        service_id: hold.service_id,
        booking_date: hold.booking_date,
        booking_time: String(hold.booking_time).slice(0, 5),
        start_time: hold.start_time,
        end_time: hold.end_time,
        price: Number(service.price ?? 0),
      }
    } else {
      throw new Error('booking_id, hold_id ou bookingData é obrigatório')
    }

    // Para pagamento online sem booking pré-criado, o hold é obrigatório.
    if (!resolvedBookingId) {
      if (!hold_id) throw new Error('Reserva temporária do horário não encontrada.');

      const { data: hold, error: holdError } = await supabaseClient
        .from('booking_slot_holds')
        .select('id, company_id, employee_id, service_id, client_id, booking_date, booking_time, start_time, end_time, expires_at, status')
        .eq('id', hold_id)
        .maybeSingle();

      if (holdError || !hold) throw new Error('Reserva temporária do horário não encontrada.');
      if (hold.status !== 'active' || new Date(hold.expires_at).getTime() <= Date.now()) {
        throw new Error('O tempo para concluir a reserva acabou. O horário foi liberado.');
      }
      if (
        String(hold.company_id) !== String(companyId) ||
        String(hold.employee_id) !== String(resolvedBookingData?.employee_id) ||
        String(hold.client_id) !== String(resolvedBookingData?.client_id) ||
        String(hold.booking_date) !== String(resolvedBookingData?.booking_date) ||
        String(hold.booking_time).slice(0, 5) !== String(resolvedBookingData?.booking_time).slice(0, 5)
      ) {
        throw new Error('Reserva temporária não corresponde aos dados deste agendamento.');
      }

      const { data: holdClient } = await supabaseClient
        .from('clients')
        .select('id')
        .eq('id', hold.client_id)
        .eq('company_id', companyId)
        .maybeSingle();

      if (!isTrustedInternalCall) {
        // Em chamadas diretas do navegador, o hold precisa pertencer ao usuário autenticado.
        const { data: authenticatedHoldClient } = await supabaseClient
          .from('clients')
          .select('id')
          .eq('id', hold.client_id)
          .eq('company_id', companyId)
          .eq('user_id', authData?.user?.id ?? '')
          .maybeSingle();
        if (!authenticatedHoldClient) throw new Error('Reserva temporária não pertence ao cliente autenticado.');
      } else if (!holdClient) {
        throw new Error('Cliente da reserva temporária não encontrado.');
      }
    }

    // O checkout web envia payer explicitamente. O Agent/API pode enviar apenas
    // booking_id; nesse caso, resolve os dados do pagador pelo cliente do agendamento.
    let resolvedPayer = payer && typeof payer === 'object' ? { ...payer } : {}
    const payerClientId = booking?.client_id ?? resolvedBookingData?.client_id ?? null
    if (payerClientId) {
      const { data: clientRow } = await supabaseClient
        .from('clients')
        .select('id,name,email,phone,cpf')
        .eq('id', payerClientId)
        .eq('company_id', companyId)
        .maybeSingle()

      if (clientRow) {
        resolvedPayer = {
          name: resolvedPayer.name || clientRow.name || 'Cliente',
          email: resolvedPayer.email || clientRow.email || undefined,
          phone: resolvedPayer.phone || clientRow.phone || undefined,
          cpf_cnpj: resolvedPayer.cpf_cnpj || clientRow.cpf || undefined,
        }
      }
    }
    const paymentMethod = String(method || 'PIX').trim().toUpperCase()
    const normalizedMethod = paymentMethod === 'PIX' ? 'PIX'
      : paymentMethod === 'CREDIT_CARD' ? 'CREDIT_CARD'
      : paymentMethod === 'DEBIT_CARD' ? 'DEBIT_CARD'
      : paymentMethod === 'BOLETO' ? 'BOLETO'
      : paymentMethod

    // A cobrança precisa de um cliente identificável no gateway. Se o Agent
    // não enviou payer, não falha com TypeError: usa o cliente do booking.
    if (!resolvedPayer.name && !resolvedPayer.email && !resolvedPayer.phone && !resolvedPayer.cpf_cnpj) {
      throw new Error('Dados do cliente não encontrados para gerar o pagamento.')
    }

    // 3. Buscar configurações de pagamento
    const { data: settings, error: sErr } = await supabaseClient
      .from('company_payment_settings')
      .select('*')
      .eq('company_id', companyId)
      .single()

    if (sErr || !settings) throw new Error('Configurações de pagamento não encontradas')

    // 4. Decide quem RECEBE o pagamento (fluxo de repasse)
    let receiverProvider: string = settings.own_gateway_provider || 'asaas'
    let receiverKey: string = (settings.own_gateway_api_key_encrypted || '').trim()
    let receiverLabel: 'company' | 'autonomous' = 'company'
    const targetEmployeeId = booking?.employee_id ?? (resolvedBookingData?.employee_id ? String(resolvedBookingData.employee_id) : null)

    try {
      if (!targetEmployeeId) throw new Error('Profissional do agendamento não informado')

      const { data: empRow } = await supabaseClient
        .from('employees')
        .select('payout_flow_override, employee_type')
        .eq('id', targetEmployeeId)
        .maybeSingle()

      const flow = empRow?.payout_flow_override || settings.payout_flow || 'via_company'

      if (flow === 'direct_to_autonomous' && empRow?.employee_type === 'autonomo') {
        const { data: eps } = await supabaseClient
          .from('employee_payment_settings')
          .select('provider, api_key_encrypted, is_active')
          .eq('employee_id', targetEmployeeId)
          .maybeSingle()
        if (eps?.is_active && eps?.api_key_encrypted) {
          receiverProvider = eps.provider
          receiverKey = (eps.api_key_encrypted || '').trim()
          receiverLabel = 'autonomous'
        } else {
          console.warn('[BOOKING_PAYMENT] direct_to_autonomous mas autônomo sem gateway — fallback p/ empresa')
        }
      }
    } catch (e) {
      console.warn('[BOOKING_PAYMENT] flow resolve fail, usando empresa:', (e as any).message)
    }

    // Identificador interno estável para reconciliar o pagamento entre gateways.
    const paymentReference = `booking-${crypto.randomUUID()}`
    const configuredOrigin = Deno.env.get('PUBLIC_APP_URL') || 'https://booking.zailom.com'
    const origin = configuredOrigin
    const bookingAmount = Number(booking?.total_price ?? booking?.price ?? resolvedBookingData?.price ?? 0)
    let originalAmount = Number(bodyAmount || bookingAmount || 0)
    let amount = originalAmount
    let couponDiscountAmount = 0
    let couponReservationToken: string | null = null

    // O banco calcula e reserva o cupom usando o preço cadastrado, não o valor do navegador.
    if (couponCode) {
      if (booking?.id) throw new Error('Aplique o cupom antes de registrar o agendamento. Cupons não podem ser adicionados a um agendamento já criado.')
      if (!resolvedBookingData || !companyId) throw new Error('Dados do agendamento insuficientes para validar o cupom.')
      const serviceId = resolvedBookingData.service_id ? String(resolvedBookingData.service_id) : null
      const comboId = resolvedBookingData.combo_id ? String(resolvedBookingData.combo_id) : null
      const { data: couponQuote, error: couponError } = await supabaseClient.rpc('reserve_company_service_coupon', {
        p_company_id: companyId, p_code: couponCode, p_service_id: serviceId, p_combo_id: comboId,
      })
      if (couponError || !couponQuote) throw new Error(couponError?.message || 'Não foi possível validar este cupom.')
      originalAmount = Number(couponQuote.original_amount)
      couponDiscountAmount = Number(couponQuote.discount_amount)
      amount = Number(couponQuote.discounted_amount)
      couponReservationToken = String(couponQuote.checkout_token)
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      if (couponReservationToken) await supabaseClient.from('company_service_coupon_redemptions').update({ status: 'cancelled' }).eq('checkout_token', couponReservationToken)
      throw new Error(`O valor do agendamento (${amount}) é inválido para processar o pagamento.`)
    }

    const methodByProvider: Record<string, string> = {
      PIX: 'PIX', CREDIT_CARD: 'CREDIT_CARD', DEBIT_CARD: 'DEBIT_CARD', BOLETO: 'BOLETO',
    }
    const selectedMethod = methodByProvider[normalizedMethod] || 'PIX'
    const paymentMeta = {
      booking_id: booking?.id ?? null,
      company_id: companyId,
      client_id: booking?.client_id ?? resolvedBookingData?.client_id ?? null,
      employee_id: booking?.employee_id ?? resolvedBookingData?.employee_id ?? null,
      service_id: booking?.service_id ?? resolvedBookingData?.service_id ?? null,
      combo_id: resolvedBookingData?.combo_id ?? null,
      hold_id: hold_id ?? null,
      reward_payment: Boolean(resolvedBookingData?.reward_id),
      booking_data: resolvedBookingData ?? bookingData ?? null,
      external_reference: paymentReference,
      coupon_code: couponCode,
      original_amount: couponCode ? originalAmount : null,
      coupon_discount_amount: couponCode ? couponDiscountAmount : null,
    }

    let paymentResult: any
    let pixInfo: Record<string, unknown> = {}
    let invoiceUrl: string | null = null
    let bankSlipUrl: string | null = null
    const requestJson = async (url: string, init: RequestInit, providerLabel: string) => {
      const response = await fetch(url, init)
      const raw = await response.text()
      let payload: any = {}
      try { payload = raw ? JSON.parse(raw) : {} } catch { payload = { message: raw } }
      if (!response.ok) {
        console.error(`[BOOKING_PAYMENT][${providerLabel}] ${response.status}:`, raw)
        const message = payload?.errors?.[0]?.description || payload?.message || payload?.error?.message || `Falha no gateway ${providerLabel} (${response.status}).`
        throw new Error(String(message))
      }
      return payload
    }

    try {
      if (receiverProvider === 'asaas') {
        const isSandbox = decryptedKey.includes('hmlg') || !decryptedKey.startsWith('$aact_')
        const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'
        const headers = { access_token: decryptedKey, 'Content-Type': 'application/json', 'User-Agent': 'SupabaseEdgeFunction/1.0' }
        const customerParams = new URLSearchParams()
        if (resolvedPayer.cpf_cnpj) customerParams.append('cpfCnpj', resolvedPayer.cpf_cnpj)
        else if (resolvedPayer.email) customerParams.append('email', resolvedPayer.email)
        const customers = await requestJson(`${baseUrl}/customers?${customerParams}`, { headers }, 'Asaas')
        let customerId = customers.data?.[0]?.id
        if (!customerId) {
          const customer = await requestJson(`${baseUrl}/customers`, {
            method: 'POST', headers,
            body: JSON.stringify({
              name: resolvedPayer.name || 'Cliente', email: resolvedPayer.email,
              phone: resolvedPayer.phone, cpfCnpj: resolvedPayer.cpf_cnpj,
            }),
          }, 'Asaas')
          customerId = customer.id
        }
        const billingType = selectedMethod
        paymentResult = await requestJson(`${baseUrl}/payments`, {
          method: 'POST', headers,
          body: JSON.stringify({
            customer: customerId, billingType, value: amount,
            dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            description: `Agendamento online ${paymentReference}`,
            externalReference: paymentReference,
            postalCode: '12345678', address: 'Rua Principal', addressNumber: '123', province: 'Centro',
            metadata: paymentMeta,
          }),
        }, 'Asaas')
        invoiceUrl = paymentResult.invoiceUrl || null
        bankSlipUrl = paymentResult.bankSlipUrl || null
        if (billingType === 'PIX') {
          try {
            const pix = await requestJson(`${baseUrl}/payments/${paymentResult.id}/pixQrCode`, { headers }, 'Asaas PIX')
            pixInfo = { pix_qr_code: pix.encodedImage ? `data:image/png;base64,${pix.encodedImage}` : null, pix_payload: pix.payload || null }
          } catch (error) { console.warn('[BOOKING_PAYMENT] Asaas PIX QR indisponível:', (error as Error).message) }
        }
      } else if (receiverProvider === 'mercadopago') {
        const preference = await requestJson('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { Authorization: `Bearer ${decryptedKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ id: paymentReference, title: 'Agendamento online', quantity: 1, currency_id: 'BRL', unit_price: amount }],
            payer: { name: resolvedPayer.name || 'Cliente', email: resolvedPayer.email || undefined, phone: resolvedPayer.phone ? { number: resolvedPayer.phone } : undefined, identification: resolvedPayer.cpf_cnpj ? { type: resolvedPayer.cpf_cnpj.length > 11 ? 'CNPJ' : 'CPF', number: resolvedPayer.cpf_cnpj } : undefined },
            external_reference: paymentReference,
            metadata: { payment_reference: paymentReference, company_id: companyId, booking_id: booking?.id ?? '', coupon_code: couponCode || '', original_amount: String(originalAmount), coupon_discount_amount: String(couponDiscountAmount), booking_data: JSON.stringify(paymentMeta.booking_data || {}) },
            payment_methods: { excluded_payment_methods: [], excluded_payment_types: (({ PIX: ['credit_card','debit_card','ticket'], CREDIT_CARD: ['bank_transfer','debit_card','ticket'], DEBIT_CARD: ['bank_transfer','credit_card','ticket'], BOLETO: ['bank_transfer','credit_card','debit_card'] } as Record<string,string[]>)[selectedMethod] || []).map((id) => ({ id })), installments: 1 },
            back_urls: { success: origin, failure: origin, pending: origin },
            auto_return: 'approved',
          }),
        }, 'Mercado Pago')
        paymentResult = { ...preference, id: preference.id, invoiceUrl: preference.init_point, method: selectedMethod, external_reference: paymentReference }
        invoiceUrl = /TEST-|TEST_/i.test(decryptedKey) ? (preference.sandbox_init_point || preference.init_point || null) : (preference.init_point || preference.sandbox_init_point || null)
      } else if (receiverProvider === 'stripe') {
        const params = new URLSearchParams()
        params.set('mode', 'payment')
        params.set('success_url', origin)
        params.set('cancel_url', origin)
        params.set('client_reference_id', paymentReference)
        if (resolvedPayer.email) params.set('customer_email', resolvedPayer.email)
        const stripeMethod = selectedMethod === 'BOLETO' ? 'boleto' : selectedMethod === 'PIX' ? 'pix' : 'card'
        params.append('payment_method_types[0]', stripeMethod)
        params.set('line_items[0][price_data][currency]', 'brl')
        params.set('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)))
        params.set('line_items[0][price_data][product_data][name]', 'Agendamento online')
        params.set('line_items[0][quantity]', '1')
        for (const [key, value] of Object.entries({
          company_id: String(companyId), payment_reference: paymentReference,
          booking_id: String(booking?.id ?? ''), coupon_code: couponCode || '',
          original_amount: String(originalAmount), coupon_discount_amount: String(couponDiscountAmount),
        })) params.set(`metadata[${key}]`, value)
        paymentResult = await requestJson('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`${decryptedKey}:`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        }, 'Stripe')
        invoiceUrl = paymentResult.url || null
      } else if (receiverProvider === 'pagarme') {
        if (selectedMethod === 'DEBIT_CARD') throw new Error('O checkout do Pagar.me configurado neste fluxo aceita PIX, crédito ou boleto, mas não débito direto. Escolha outro método.');
        const acceptedMethod = selectedMethod === 'PIX' ? 'pix' : selectedMethod === 'BOLETO' ? 'boleto' : 'credit_card'
        const cents = Math.round(amount * 100)
        const paymentSettings: Record<string, unknown> = { accepted_payment_methods: [acceptedMethod] }
        if (acceptedMethod === 'credit_card') paymentSettings.credit_card_settings = { operation_type: 'auth_and_capture', installments: [{ number: 1, total: cents }] }
        if (acceptedMethod === 'boleto') paymentSettings.boleto_settings = {}
        if (acceptedMethod === 'pix') paymentSettings.pix_settings = { expires_in: 3600 }
        const pagarmeBaseUrl = /^sk_test_/i.test(decryptedKey) ? 'https://sdx-api.pagar.me/core/v5' : 'https://api.pagar.me/core/v5'
        paymentResult = await requestJson(`${pagarmeBaseUrl}/paymentlinks`, {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`${decryptedKey}:`)}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name: `Agendamento ${paymentReference}`, type: 'order', order_code: paymentReference,
            max_sessions: 1, max_paid_sessions: 1,
            payment_settings: paymentSettings,
            cart_settings: { items: [{ amount: cents, name: 'Agendamento online', default_quantity: 1 }] },
          }),
        }, 'Pagar.me')
        invoiceUrl = paymentResult.url || null
      } else {
        throw new Error(`Gateway "${receiverProvider}" não é suportado pelo checkout online.`)
      }
      if (!paymentResult?.id) throw new Error(`O gateway ${receiverProvider} não retornou um identificador de pagamento.`)
      if (receiverProvider !== 'asaas' && !invoiceUrl) throw new Error(`O gateway ${receiverProvider} não retornou o link de checkout.`)
    } catch (paymentError) {
      if (couponReservationToken) {
        await supabaseClient.from('company_service_coupon_redemptions').update({ status: 'cancelled' }).eq('checkout_token', couponReservationToken).eq('status', 'reserved')
      }
      throw paymentError
    }

    const billingType = selectedMethod
    console.log(`[BOOKING_PAYMENT] Provider=${receiverProvider} method=${billingType} amount=${amount} coupon=${couponCode ?? 'none'}`)
    const responseData = {
      payment: {
        id: paymentResult.id,
        provider: receiverProvider,
        method: billingType,
        amount,
        original_amount: couponCode ? originalAmount : amount,
        coupon_discount_amount: couponCode ? couponDiscountAmount : 0,
        coupon_code: couponCode,
        external_reference: paymentReference,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        ...pixInfo
      }
    }

    if (couponReservationToken) {
      const { error: finalizeError } = await supabaseClient.rpc('finalize_company_service_coupon', {
        p_checkout_token: couponReservationToken,
        p_provider_payment_id: String(paymentResult.id),
      })
      if (finalizeError) {
        console.error('[BOOKING_PAYMENT] Falha ao vincular cupom ao pagamento:', finalizeError.message)
      }
    }

    // Gravar no banco
    const { error: dbErr } = await supabaseClient.from('booking_payments').insert({
      booking_id: booking?.id ?? null,
      company_id: companyId,
      asaas_id: receiverProvider === 'asaas' ? String(paymentResult.id) : null,
      provider_payment_id: String(paymentResult.id),
      provider: receiverProvider,
      amount,
      status: 'pending',
      method: billingType,
      payment_data: responseData.payment,
      metadata: {
        booking_data: resolvedBookingData ?? bookingData ?? null,
        company_id: companyId,
        client_id: booking?.client_id ?? resolvedBookingData?.client_id ?? null,
        employee_id: booking?.employee_id ?? resolvedBookingData?.employee_id ?? null,
        combo_id: resolvedBookingData?.combo_id ?? null,
        hold_id: hold_id ?? null,
        coupon_code: couponCode,
        original_amount: couponCode ? originalAmount : null,
        coupon_discount_amount: couponCode ? couponDiscountAmount : null,
      }
    })

    if (dbErr) {
      console.error('[BOOKING_PAYMENT] DB Insert Error:', dbErr.message)
      // Não falha a requisição se o pagamento no Asaas foi criado, mas tenta logar o erro
    } else if (booking?.id) {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-booking-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        },
        body: JSON.stringify({ booking_id: booking.id, event_key: 'payment_pending' }),
      }).catch((e) => console.warn('[BOOKING_PAYMENT] payment_pending notification failed:', e?.message ?? e))
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('[BOOKING_PAYMENT] Error:', error.message)
    
    const status = /unauthorized|invalid api key|access denied|autorização falhou/i.test(error.message) ? 401 : 400
    const message = error.message

    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })
  }
})




