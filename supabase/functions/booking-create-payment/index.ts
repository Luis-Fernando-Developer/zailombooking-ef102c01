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

    const rawBody = await req.text()
    const body = JSON.parse(rawBody)
    const { booking_id, method, payer } = body

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

    let decryptedKey = (settings.own_gateway_api_key_encrypted || "").trim()
      .replace(/[\n\r\t]/g, '')
      .replace(/[^\x20-\x7E]/g, '')

    if (!decryptedKey || decryptedKey.length < 10) {
      throw new Error('Chave de API do Asaas não encontrada. Por favor, salve a chave novamente nas configurações.')
    }

    if (settings.own_gateway_provider === 'asaas') {
      const isSandbox = !decryptedKey.startsWith('$aact_')
      const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'
      
      const authHeaders = { 
        'access_token': decryptedKey,
        'Content-Type': 'application/json',
        'User-Agent': 'SupabaseEdgeFunction/1.0'
      }

      // Helper to handle Asaas fetch with debugging
      const asaasFetch = async (url: string, options: any) => {
        const res = await fetch(url, options)
        if (!res.ok) {
          const text = await res.text()
          console.error(`Asaas error at ${url}. Status: ${res.status}. Body: ${text}`)
          
          if (res.status === 401) {
            throw new Error(`CHAVE_API_INVALIDA|${isSandbox ? 'SANDBOX' : 'PRODUCAO'}|${decryptedKey.substring(0, 10)}`)
          }
          
          try {
            const json = JSON.parse(text)
            if (json.errors?.[0]?.description) throw new Error(json.errors[0].description)
          } catch (e) {
            if (!e.message.includes('CHAVE_API_INVALIDA')) throw new Error(`Erro Asaas (${res.status}): ${text.substring(0, 100)}`)
            throw e
          }
        }
        return res.json()
      }

      // A) Find or create customer
      const urlParams = new URLSearchParams()
      if (payer.cpf_cnpj) urlParams.append('cpfCnpj', payer.cpf_cnpj)
      else if (payer.email) urlParams.append('email', payer.email)
      
      const customerData = await asaasFetch(`${baseUrl}/customers?${urlParams.toString()}`, {
        method: 'GET',
        headers: authHeaders
      })

      let customerId = customerData.data?.[0]?.id

      if (!customerId) {
        const newCustomer = await asaasFetch(`${baseUrl}/customers`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            name: payer.name || 'Cliente Agendamento',
            email: payer.email,
            phone: payer.phone,
            cpfCnpj: payer.cpf_cnpj
          })
        })
        customerId = newCustomer.id
      }

      // B) Create payment
      const billingType = method === 'PIX' ? 'PIX' : (method === 'CREDIT_CARD' ? 'CREDIT_CARD' : (method === 'DEBIT_CARD' ? 'DEBIT_CARD' : 'BOLETO'))
      
      const paymentResult = await asaasFetch(`${baseUrl}/payments`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          customer: customerId,
          billingType: billingType,
          value: booking.total_price,
          dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          description: `Agendamento #${booking.id}`,
          externalReference: booking.id,
        })
      })

      // C) If PIX, get QR Code
      let pixInfo = {}
      if (billingType === 'PIX') {
        try {
          const pixData = await asaasFetch(`${baseUrl}/payments/${paymentResult.id}/pixQrCode`, {
            method: 'GET',
            headers: authHeaders
          })
          pixInfo = { pix_qr_code: pixData.encodedImage, pix_payload: pixData.payload }
        } catch (e) {
          console.warn('Failed to get Pix QR Code:', e.message)
        }
      }

      const paymentData = {
        id: paymentResult.id,
        method: billingType,
        invoice_url: paymentResult.invoiceUrl,
        bank_slip_url: paymentResult.bankSlipUrl,
        ...pixInfo
      }

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

  } catch (error: any) {
    console.error('Edge Function Error:', error.message)
    
    if (error.message.startsWith('CHAVE_API_INVALIDA')) {
      const [, env, prefix] = error.message.split('|')
      return new Response(JSON.stringify({ 
        error: `A Chave de API (${prefix}...) não foi aceita pelo Asaas em modo ${env}. Verifique se você não está usando uma chave de Sandbox no ambiente de Produção ou vice-versa.`,
        code: 'INVALID_API_KEY'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})



