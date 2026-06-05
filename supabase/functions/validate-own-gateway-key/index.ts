import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log(`Request method: ${req.method}`)
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Request body:', JSON.stringify(body))
    
    const { api_key, provider } = body

    if (!api_key) {
      console.error('Missing API Key')
      return new Response(JSON.stringify({ error: 'API Key is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (provider === 'asaas') {
      console.log('Validating Asaas key...')
      // Asaas production uses https://www.asaas.com/api/v3
      // Sandbox uses https://sandbox.asaas.com/api/v3
      // We'll try accounts to check the key
      const response = await fetch('https://www.asaas.com/api/v3/accounts', {
        headers: {
          'access_token': api_key,
        },
      })

      const responseText = await response.text()
      console.log(`Asaas response status: ${response.status}`)
      console.log(`Asaas response body: ${responseText}`)

      let data
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        data = { errors: [{ description: 'Resposta inválida do Asaas' }] }
      }

      if (!response.ok) {
        const errorMsg = data.errors?.[0]?.description || 'Chave Asaas inválida ou sem permissão'
        return new Response(JSON.stringify({ error: errorMsg }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      // If success, data usually contains a list of accounts or the account info
      const accountName = data.data?.[0]?.name || data.name || 'Conta Asaas'
      return new Response(JSON.stringify({ account_name: accountName }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: `Provedor '${provider}' não implementado` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
