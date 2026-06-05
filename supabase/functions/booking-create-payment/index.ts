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
    console.log('Attempting to get API Key for company:', booking.company_id)
    
    if (settings.own_gateway_api_key_encrypted) {
      const rawKey = settings.own_gateway_api_key_encrypted;
      console.log('Raw key from DB length:', rawKey.length)
      
      // Se a chave já começa com o prefixo do Asaas ($aact_ para produção ou sem ele para sandbox mas com formato de token)
      // O Asaas costuma ter chaves de 64 caracteres hexadecimais (sandbox) ou começando com $aact_ (produção)
      if (rawKey.startsWith('$aact_') || rawKey.length > 50) {
        console.log('API Key seems to be plain text, using as is')
        decryptedKey = rawKey
      } else {
        console.log('Attempting RPC decryption for encrypted key...')
        try {
          const { data: decrypted, error: decErr } = await supabaseClient.rpc('decrypt_chatbot_key', {
            p_encrypted: rawKey,
            p_secret: "asaas-own-gateway"
          })

          if (decErr) {
            console.error('RPC decryption error:', decErr)
            // Se falhou o RPC, tentamos usar a chave bruta como último recurso
            decryptedKey = rawKey
          } else if (!decrypted) {
            console.log('RPC returned empty result, falling back to raw value')
            decryptedKey = rawKey
          } else {
            console.log('RPC decryption successful')
            decryptedKey = decrypted
          }
        } catch (e) {
          console.error('Exception during RPC call:', e)
          decryptedKey = rawKey
        }
      }
    }

    if (!decryptedKey || decryptedKey.trim() === "") {
      throw new Error('Chave de API do Asaas não encontrada ou está vazia nas configurações')
    }


    // 3. Create payment in Asaas
    if (settings.own_gateway_provider === 'asaas') {
      const isSandbox = !decryptedKey.startsWith('$aact_')
      const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'
      
      console.log(`Using Asaas ${isSandbox ? 'Sandbox' : 'Production'} environment`)

      // A) First, find or create customer
      const customerSearch = await fetch(`${baseUrl}/customers?email=${payer.email || ''}&cpfCnpj=${payer.cpf_cnpj || ''}`, {
        headers: { 'access_token': decryptedKey }
      })
      const customerData = await customerSearch.json()
      
      let customerId = customerData.data?.[0]?.id

      if (!customerId) {
        const createCustomer = await fetch(`${baseUrl}/customers`, {
          method: 'POST',
          headers: {
            'access_token': decryptedKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: payer.name || 'Cliente Agendamento',
            email: payer.email,
            phone: payer.phone,
            cpfCnpj: payer.cpf_cnpj
          })
        })
        const newCustomer = await createCustomer.json()
        if (newCustomer.errors) throw new Error(`Erro ao criar cliente no Asaas: ${newCustomer.errors[0].description}`)
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentPayload)
      })

      const paymentResult = await createPayment.json()
      if (paymentResult.errors) {
        console.error('Asaas payment creation errors:', paymentResult.errors)
        throw new Error(`Erro ao gerar cobrança no Asaas: ${paymentResult.errors[0].description}`)
      }

      // C) If PIX, get QR Code
      let pixInfo = {}
      if (billingType === 'PIX') {
        const getPix = await fetch(`${baseUrl}/payments/${paymentResult.id}/pixQrCode`, {
          headers: { 'access_token': decryptedKey }
        })
        const pixData = await getPix.json()
        pixInfo = {
          pix_qr_code: pixData.encodedImage,
          pix_payload: pixData.payload
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
    console.error('Function error detailed:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    })
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
