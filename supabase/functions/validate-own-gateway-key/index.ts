import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

async function validateAsaas(apiKey: string) {
  const isSandbox = !apiKey.startsWith('$aact_prod_')
  const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'
  const r = await fetch(`${baseUrl}/myAccount`, { headers: { access_token: apiKey } })
  const text = await r.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { /* noop */ }
  if (!r.ok) {
    return { error: data?.errors?.[0]?.description || 'Chave Asaas inválida' }
  }
  return { account_name: data?.name || data?.email || 'Conta Asaas', environment: isSandbox ? 'sandbox' : 'production' }
}

async function validateMercadoPago(apiKey: string) {
  const r = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const text = await r.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { /* noop */ }
  if (!r.ok) return { error: data?.message || 'Access Token inválido (Mercado Pago)' }
  const env = apiKey.includes('TEST') ? 'sandbox' : 'production'
  return { account_name: data?.nickname || data?.email || `MP ${data?.id}`, environment: env }
}

async function validateStripe(apiKey: string) {
  const r = await fetch('https://api.stripe.com/v1/account', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const text = await r.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { /* noop */ }
  if (!r.ok) return { error: data?.error?.message || 'Secret Key inválida (Stripe)' }
  const env = apiKey.startsWith('sk_test_') ? 'sandbox' : 'production'
  return { account_name: data?.business_profile?.name || data?.email || data?.id || 'Conta Stripe', environment: env }
}

async function validatePagarme(apiKey: string) {
  const auth = btoa(`${apiKey}:`)
  const r = await fetch('https://api.pagar.me/core/v5/merchants/me', {
    headers: { Authorization: `Basic ${auth}` },
  })
  // Fallback: Pagar.me v5 retorna 404 em alguns escopos; tente /balance que exige autenticação.
  if (r.status === 404) {
    const r2 = await fetch('https://api.pagar.me/core/v5/balance', {
      headers: { Authorization: `Basic ${auth}` },
    })
    const t2 = await r2.text()
    if (!r2.ok) {
      let d2: any = {}; try { d2 = JSON.parse(t2) } catch {}
      return { error: d2?.message || 'Secret Key inválida (Pagar.me)' }
    }
    return { account_name: 'Conta Pagar.me', environment: apiKey.startsWith('sk_test_') ? 'sandbox' : 'production' }
  }
  const text = await r.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { /* noop */ }
  if (!r.ok) return { error: data?.message || 'Secret Key inválida (Pagar.me)' }
  return {
    account_name: data?.name || data?.merchant?.name || 'Conta Pagar.me',
    environment: apiKey.startsWith('sk_test_') ? 'sandbox' : 'production',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { api_key, provider } = await req.json()
    if (!api_key) return ok({ error: 'API Key is required' }, 400)

    let result
    switch (provider) {
      case 'asaas':       result = await validateAsaas(api_key); break
      case 'mercadopago': result = await validateMercadoPago(api_key); break
      case 'stripe':      result = await validateStripe(api_key); break
      case 'pagarme':     result = await validatePagarme(api_key); break
      default:            return ok({ error: `Provedor '${provider}' não suportado` }, 400)
    }

    if ((result as any).error) return ok(result, 400)
    return ok(result, 200)
  } catch (error: any) {
    console.error('validate-own-gateway-key error:', error)
    return ok({ error: error.message || 'Erro interno' }, 500)
  }
})
