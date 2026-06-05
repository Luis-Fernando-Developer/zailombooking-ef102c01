import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { api_key, provider } = await req.json()

    if (!api_key) {
      return new Response(JSON.stringify({ error: 'API Key is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (provider === 'asaas') {
      const response = await fetch('https://www.asaas.com/api/v3/accounts', {
        headers: {
          'access_token': api_key,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.errors?.[0]?.description || 'Invalid Asaas key' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      return new Response(JSON.stringify({ account_name: data.data?.[0]?.name || 'Conta Asaas' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: 'Provider not implemented yet' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
