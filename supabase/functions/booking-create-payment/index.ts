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

    const { booking_id, method, payer } = await req.json()
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

    // 2. Decrypt API Key
    let decryptedKey = ""
    console.log('--- DIAGNOSTIC START ---')
    console.log('Company ID:', booking.company_id)
    
    if (settings.own_gateway_api_key_encrypted) {
      const rawKey = settings.own_gateway_api_key_encrypted;
      console.log('Raw key from DB length:', rawKey.length)
      
      // If the key is already in the Asaas format, use it directly
      if (rawKey.startsWith('$aact_') || (rawKey.length > 50 && !rawKey.includes(':'))) {
        console.log('API Key seems to be stored in plain text (migrated or not encrypted), using as-is.')
        decryptedKey = rawKey
      } else {
        console.log('Key appears encrypted, attempting RPC decryption...')
        try {
          const { data: decrypted, error: decErr } = await supabaseClient.rpc('decrypt_chatbot_key', {
            p_encrypted: rawKey,
            p_secret: "asaas-own-gateway"
          })

          if (decErr) {
            console.warn('RPC decryption failed:', decErr.message)
            decryptedKey = rawKey
          } else if (!decrypted) {
            console.log('RPC returned no data (possibly already plain text but failed check), using raw key')
            decryptedKey = rawKey
          } else {
            console.log('RPC decryption successful')
            decryptedKey = decrypted
          }
        } catch (e) {
          console.error('Exception during decryption:', e.message)
          decryptedKey = rawKey
        }
      }
    }

    // Clean up the key
    decryptedKey = decryptedKey?.trim() || ""
    
    if (!decryptedKey || decryptedKey.length < 10) {
      console.error('ERROR: No valid key found. Found length:', decryptedKey.length)
      throw new Error('Chave de API do Asaas não encontrada ou inválida. Por favor, salve a chave novamente nas configurações.')
    }

    console.log('Final key length:', decryptedKey.length)
    console.log('Final key starts with:', decryptedKey.substring(0, 10))
    console.log('--- DIAGNOSTIC END ---')


    // 3. Create payment in Asaas
    if (settings.own_gateway_provider === 'asaas') {
      const isSandbox = !decryptedKey.startsWith('$aact_')
      const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'
      
      console.log(`Using Asaas ${isSandbox ? 'Sandbox' : 'Production'} environment`)

      // A) First, find or create customer
      const urlParams = new URLSearchParams()
      if (payer.email) urlParams.append('email', payer.email)
      if (payer.cpf_cnpj) urlParams.append('cpfCnpj', payer.cpf_cnpj)
      
      const searchUrl = `${baseUrl}/customers?${urlParams.toString()}`
      console.log('Searching customer at:', searchUrl)

      let customerSearchResponse;
      try {
        customerSearchResponse = await fetch(searchUrl, {
          headers: { 
            'access_token': decryptedKey,
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
          console.error('CRITICAL: Invalid API Key or Unauthorized. Token prefix:', decryptedKey.substring(0, 10))
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
          try {
            const errJson = JSON.parse(errorText)
            if (errJson.errors) throw new Error(`Erro ao criar cliente no Asaas: ${errJson.errors[0].description}`)
          } catch (e) {
            if (e.message.includes('Erro ao criar cliente')) throw e
          }
          throw new Error(`Asaas API error (Create Customer): ${createCustomer.status} - ${errorText}`)
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
        try {
          const errJson = JSON.parse(errorText)
          if (errJson.errors) throw new Error(`Erro ao gerar cobrança no Asaas: ${errJson.errors[0].description}`)
        } catch (e) {
          if (e.message.includes('Erro ao gerar cobrança')) throw e
        }
        throw new Error(`Asaas API error (Create Payment): ${createPayment.status} - ${errorText}`)
      }

      const paymentResult = await createPayment.json()

      // C) If PIX, get QR Code
      let pixInfo = {}
      if (billingType === 'PIX') {
        const getPix = await fetch(`${baseUrl}/payments/${paymentResult.id}/pixQrCode`, {
          headers: { 
            'access_token': decryptedKey,
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
    
    // Tratamento especial para erros de autenticação para retornar status 401
    if (detailedError === 'CHAVE_API_INVALIDA') {
      return new Response(JSON.stringify({ 
        error: 'Chave de API do Asaas inválida ou sem permissão. Verifique se a chave está correta e se possui as permissões necessárias.',
        code: 'INVALID_API_KEY'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    try {
      if (error.message.includes('{')) {
        const jsonStart = error.message.indexOf('{')
        const jsonStr = error.message.substring(jsonStart)
        const errObj = JSON.parse(jsonStr)
        if (errObj.errors && errObj.errors[0]) {
          detailedError = errObj.errors[0].description
        }
      }
    } catch (e) {
      console.warn('Failed to parse error JSON', e)
    }

    return new Response(JSON.stringify({ 
      error: detailedError,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400, // Usamos 400 em vez de 500 para erros de negócio/entrada
    })
  }
})

