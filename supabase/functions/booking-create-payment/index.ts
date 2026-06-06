import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Log the raw body for debugging (only once)
    const rawBody = await req.text()
    console.log('--- RAW REQUEST BODY ---')
    console.log(rawBody)
    
    const body = JSON.parse(rawBody)
    const { booking_id, method, payer } = body
    console.log(`Processing payment for booking ${booking_id} via ${method}`)

    // 1. Get booking and company settings
    const { data: booking, error: bErr } = await supabaseClient
      .from('bookings')
      .select('*, company:companies(*)')
      .eq('id', booking_id)
      .single()

    if (bErr || !booking) throw new Error('Agendamento não encontrado')

    const { data: settings, error: sErr } = await supabaseClient
      .from('company_payment_settings')
      .select('*')
      .eq('company_id', booking.company_id)
      .single()

    if (sErr || !settings) throw new Error('Configurações de pagamento não encontradas')

    // 2. API Key Retrieval (Simple & Robust)
    let decryptedKey = settings.own_gateway_api_key_encrypted || ""
    
    console.log('--- DIAGNOSTIC START ---')
    console.log('Company ID:', booking.company_id)
    console.log('Raw key from DB length:', decryptedKey.length)

    // Force cleaning of any potential invisible characters
    decryptedKey = decryptedKey.trim()
      .replace(/[\n\r\t]/g, '')
      .replace(/[^\x20-\x7E]/g, '') // Remove non-printable characters

    if (!decryptedKey || decryptedKey.length < 10) {
      console.error('ERROR: No valid key found.')
      throw new Error('Chave de API do Asaas não encontrada. Por favor, salve a chave novamente nas configurações.')
    }

    console.log('Cleaned key length:', decryptedKey.length)
    console.log('Cleaned key starts with:', decryptedKey.substring(0, 10))
    console.log('--- DIAGNOSTIC END ---')


    // 3. Create payment in Asaas
    if (settings.own_gateway_provider === 'asaas') {
      const isSandbox = !decryptedKey.startsWith('$aact_')
      const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'
      
      console.log(`Using Asaas ${isSandbox ? 'Sandbox' : 'Production'} environment`)

      // A) First, find or create customer
      const urlParams = new URLSearchParams()
      if (payer.cpf_cnpj) urlParams.append('cpfCnpj', payer.cpf_cnpj)
      else if (payer.email) urlParams.append('email', payer.email)
      
      const searchUrl = `${baseUrl}/customers?${urlParams.toString()}`
      console.log('Searching customer at:', searchUrl)

      let customerSearchResponse;
      try {
        console.log('Requesting Asaas (Search Customer)')
        customerSearchResponse = await fetch(searchUrl, {
          method: 'GET',
          headers: { 
            'access_token': decryptedKey,
            'Content-Type': 'application/json',
            'User-Agent': 'SupabaseEdgeFunction/1.0'
          }
        })
      } catch (e) {
        console.error('Fetch error (Search Customer):', e.message)
        throw new Error(`Erro de conexão com o Asaas: ${e.message}`)
      }
      
      if (!customerSearchResponse.ok) {
        const errorText = await customerSearchResponse.text()
        console.error('Customer search failed. Status:', customerSearchResponse.status, 'Body:', errorText)
        
        if (customerSearchResponse.status === 401 || customerSearchResponse.status === 403) {
          console.error('CRITICAL: Invalid API Key. Token prefix used:', decryptedKey.substring(0, 10))
          throw new Error('CHAVE_API_INVALIDA')
        }
        
        try {
          const errJson = JSON.parse(errorText)
          if (errJson.errors && errJson.errors[0]) {
            throw new Error(`Erro Asaas (Busca): ${errJson.errors[0].description}`)
          }
        } catch (e) {
          if (e.message.startsWith('Erro Asaas')) throw e
        }
        
        throw new Error(`Asaas API error (Search Customer): ${customerSearchResponse.status}`)
      }

      const customerData = await customerSearchResponse.json()
      let customerId = customerData.data?.[0]?.id

      if (!customerId) {
        console.log('Customer not found, creating new one...')
        const createCustomer = await fetch(`${baseUrl}/customers`, {
          method: 'POST',
          headers: {
            'access_token': decryptedKey,
            'Content-Type': 'application/json',
            'User-Agent': 'SupabaseEdgeFunction/1.0'
          },
          body: JSON.stringify({
            name: payer.name || 'Cliente Agendamento',
            email: payer.email,
            phone: payer.phone,
            cpfCnpj: payer.cpf_cnpj
          })
        })

        if (!createCustomer.ok) {
          const errorText = await createCustomer.text()
          console.error('Customer creation failed:', errorText)
          if (createCustomer.status === 401 || createCustomer.status === 403) {
            throw new Error('CHAVE_API_INVALIDA')
          }
          try {
            const errJson = JSON.parse(errorText)
            if (errJson.errors) throw new Error(`Erro ao criar cliente no Asaas: ${errJson.errors[0].description}`)
          } catch (e) {
            if (e.message.includes('Erro ao criar cliente')) throw e
          }
          throw new Error(`Asaas API error (Create Customer): ${createCustomer.status}`)
        }

        const newCustomer = await createCustomer.json()
        customerId = newCustomer.id
      }

      // B) Create payment
      const billingType = method === 'PIX' ? 'PIX' : (method === 'CREDIT_CARD' ? 'CREDIT_CARD' : (method === 'DEBIT_CARD' ? 'DEBIT_CARD' : 'BOLETO'))
      
      const paymentPayload = {
        customer: customerId,
        billingType: billingType,
        value: booking.total_price,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        description: `Agendamento #${booking.id}`,
        externalReference: booking.id,
      }

      const createPayment = await fetch(`${baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'access_token': decryptedKey,
          'Content-Type': 'application/json',
          'User-Agent': 'SupabaseEdgeFunction/1.0'
        },
        body: JSON.stringify(paymentPayload)
      })

      if (!createPayment.ok) {
        const errorText = await createPayment.text()
        console.error('Payment creation failed:', errorText)
        if (createPayment.status === 401 || createPayment.status === 403) {
          throw new Error('CHAVE_API_INVALIDA')
        }
        try {
          const errJson = JSON.parse(errorText)
          if (errJson.errors) throw new Error(`Erro ao gerar cobrança no Asaas: ${errJson.errors[0].description}`)
        } catch (e) {
          if (e.message.includes('Erro ao gerar cobrança')) throw e
        }
        throw new Error(`Asaas API error (Create Payment): ${createPayment.status}`)
      }

      const paymentResult = await createPayment.json()

      // C) If PIX, get QR Code
      let pixInfo = {}
      if (billingType === 'PIX') {
        const getPix = await fetch(`${baseUrl}/payments/${paymentResult.id}/pixQrCode`, {
          method: 'GET',
          headers: { 
            'access_token': decryptedKey,
            'Content-Type': 'application/json',
            'User-Agent': 'SupabaseEdgeFunction/1.0'
          }
        })
        
        if (!getPix.ok) {
          console.warn('Failed to get Pix QR Code, but payment was created')
        } else {
          const pixData = await getPix.json()
          pixInfo = {
            pix_qr_code: pixData.encodedImage,
            pix_payload: pixData.payload
          }
        }
      }

      const paymentData = {
        id: paymentResult.id,
        method: billingType,
        invoice_url: paymentResult.invoiceUrl,
        bank_slip_url: paymentResult.bankSlipUrl,
        ...pixInfo
      }

      // Save payment info in database
      await supabaseClient.from('booking_payments').insert({
        booking_id: booking.id,
        gateway_payment_id: paymentResult.id,
        provider: 'asaas',
        amount: booking.total_price,
        status: 'pending',
        method: billingType,
        payment_data: paymentData
      })

      return new Response(JSON.stringify({ payment: paymentData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    throw new Error('Provedor de pagamento não suportado')

  } catch (error) {
    console.error('CRITICAL ERROR in Edge Function:', error.message)
    
    let detailedError = error.message
    
    if (detailedError === 'CHAVE_API_INVALIDA') {
      return new Response(JSON.stringify({ 
        error: 'Chave de API do Asaas inválida ou sem permissão. Verifique sua chave no painel do Asaas.',
        code: 'INVALID_API_KEY'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    return new Response(JSON.stringify({ 
      error: detailedError,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})


