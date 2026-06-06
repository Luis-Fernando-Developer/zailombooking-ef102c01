import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Resposta rápida para preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Extração do corpo com log básico
    const rawBody = await req.text()
    console.log('[BOOKING_PAYMENT] Request body:', rawBody)
    
    let body
    try {
      body = JSON.parse(rawBody)
    } catch (e) {
      throw new Error('Corpo da requisição inválido')
    }

    const { booking_id, method, payer, amount: bodyAmount } = body
    if (!booking_id) throw new Error('booking_id é obrigatório')

    // 3. Buscar agendamento e empresa
    const { data: booking, error: bErr } = await supabaseClient
      .from('bookings')
      .select('*, company:companies(*)')
      .eq('id', booking_id)
      .single()

    if (bErr || !booking) throw new Error('Agendamento não encontrado')

    // 4. Buscar configurações de pagamento
    const { data: settings, error: sErr } = await supabaseClient
      .from('company_payment_settings')
      .select('*')
      .eq('company_id', booking.company_id)
      .single()

    if (sErr || !settings) throw new Error('Configurações de pagamento não encontradas')

    // 5. Limpeza da chave
    let decryptedKey = (settings.own_gateway_api_key_encrypted || "").trim()
    
    if (!decryptedKey) {
      throw new Error('Chave de API do Asaas não configurada na empresa')
    }

    // 6. Decisão de Ambiente (Sandbox vs Produção)
    // Se a chave começa com $aact_hmlg_ ou é curta, é sandbox (homologação)
    // Se a chave começa com $aact_ mas NÃO tem hmlg_, ou se o usuário explicitamente marcou produção
    const isSandbox = decryptedKey.includes('hmlg') || !decryptedKey.startsWith('$aact_')
    const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'
    
    console.log(`[BOOKING_PAYMENT] Mode: ${isSandbox ? 'SANDBOX' : 'PRODUCTION'}`)
    console.log(`[BOOKING_PAYMENT] Target: ${baseUrl}`)

    const authHeaders = { 
      'access_token': decryptedKey,
      'Content-Type': 'application/json',
      'User-Agent': 'SupabaseEdgeFunction/1.0'
    }

    console.log(`[BOOKING_PAYMENT] Auth header (prefix): ${decryptedKey.substring(0, 15)}...`)
    console.log(`[BOOKING_PAYMENT] Auth header (suffix): ...${decryptedKey.substring(Math.max(0, decryptedKey.length - 10))}`)

    // Generic Asaas Fetch with improved error logging
    const asaasFetch = async (url: string, options: any) => {
      const response = await fetch(url, options)
      const text = await response.text()
      
      if (!response.ok) {
        console.error(`[ASAAS_ERROR] ${response.status} | ${url} | Response: ${text}`)
        
        if (response.status === 401) {
          throw new Error('AUTORIZACAO_FALHOU_ASAAS')
        }
        
        try {
          const json = JSON.parse(text)
          if (json.errors?.[0]?.description) throw new Error(json.errors[0].description)
        } catch (e) {
          if (e.message === 'AUTORIZACAO_FALHOU_ASAAS') throw e
          throw new Error(`Erro Asaas (${response.status})`)
        }
      }
      
      try {
        return JSON.parse(text)
      } catch (e) {
        return text
      }
    }

    // A) Cliente
    const urlParams = new URLSearchParams()
    if (payer.cpf_cnpj) urlParams.append('cpfCnpj', payer.cpf_cnpj)
    else if (payer.email) urlParams.append('email', payer.email)
    
    let customerId
    const customers = await asaasFetch(`${baseUrl}/customers?${urlParams.toString()}`, {
      method: 'GET',
      headers: authHeaders
    })

    customerId = customers.data?.[0]?.id

    if (!customerId) {
      console.log('[BOOKING_PAYMENT] Creating customer...')
      const newCustomer = await asaasFetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: payer.name || 'Cliente',
          email: payer.email,
          phone: payer.phone,
          cpfCnpj: payer.cpf_cnpj
        })
      })
      customerId = newCustomer.id
    }

    // B) Pagamento
    const billingType = method === 'PIX' ? 'PIX' : (method === 'CREDIT_CARD' ? 'CREDIT_CARD' : (method === 'DEBIT_CARD' ? 'DEBIT_CARD' : 'BOLETO'))
    
    const amount = Number(bodyAmount || booking.total_price || 0)
    console.log(`[BOOKING_PAYMENT] Creating payment: ${billingType} | Amount: ${amount}`)

    if (!amount || amount <= 0) {
      throw new Error(`O valor do agendamento (${amount}) é inválido para processar o pagamento.`)
    }

    const paymentResult = await asaasFetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customer: customerId,
        billingType: billingType,
        value: amount,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // 24h
        description: `Agendamento #${booking.id}`,
        externalReference: booking.id,
      })
    })

    // C) QR Code se for PIX
    let pixInfo = {}
    if (billingType === 'PIX') {
      try {
        const pixData = await asaasFetch(`${baseUrl}/payments/${paymentResult.id}/pixQrCode`, {
          method: 'GET',
          headers: authHeaders
        })
        pixInfo = { 
          pix_qr_code: `data:image/png;base64,${pixData.encodedImage}`, 
          pix_payload: pixData.payload 
        }
      } catch (e) {
        console.warn('[BOOKING_PAYMENT] Pix QR Code fail:', e.message)
      }
    }

    const responseData = {
      payment: {
        id: paymentResult.id,
        method: billingType,
        invoice_url: paymentResult.invoiceUrl,
        bank_slip_url: paymentResult.bankSlipUrl,
        ...pixInfo
      }
    }

    // Gravar no banco
    await supabaseClient.from('booking_payments').insert({
      booking_id: booking.id,
      gateway_payment_id: paymentResult.id,
      provider: 'asaas',
      amount: booking.total_price,
      status: 'pending',
      method: billingType,
      payment_data: responseData.payment
    })

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('[BOOKING_PAYMENT] Error:', error.message)
    
    const isAuthError = error.message === 'AUTORIZACAO_FALHOU_ASAAS'
    const status = isAuthError ? 401 : 400
    const message = isAuthError 
      ? 'A chave de API não foi aceita pelo Asaas. Verifique se a chave é do ambiente correto (Sandbox vs Produção) e se foi copiada sem espaços.'
      : error.message

    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })
  }
})




