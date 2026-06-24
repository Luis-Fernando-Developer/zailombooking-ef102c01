// Orquestrador de repasse ao autônomo.
// Cenário A: empresa e autônomo no MESMO gateway -> usa split nativo (registra como native_split).
// Cenário B: gateways DIFERENTES -> dispara repasse independente via gateway do autônomo (cross_gateway).
//
// Entrada: { booking_id: string }
// Lê: bookings, booking_payments, company_payment_settings, employee_payment_settings
// Escreve: autonomous_payouts (linha por execução)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ok = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

// ----- Transfer drivers (subaccount -> external) ---------------------------
async function transferAsaas(apiKey: string, amount: number, pixKey?: string) {
  const isSandbox = !apiKey.startsWith('$aact_prod_')
  const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'
  const body: any = { value: amount, operationType: 'PIX' }
  if (pixKey) { body.pixAddressKey = pixKey; body.pixAddressKeyType = 'EVP' }
  const r = await fetch(`${baseUrl}/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: apiKey },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.errors?.[0]?.description || 'Falha transferência Asaas')
  return d?.id as string
}

async function transferMercadoPago(apiKey: string, amount: number, pixKey?: string) {
  // MP requer money_request/disbursement (depende do tipo de conta). Implementação simplificada.
  const r = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      transaction_amount: amount,
      description: 'Repasse autônomo',
      payment_method_id: 'pix',
      payer: { email: pixKey || 'autonomo@example.com' },
    }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.message || 'Falha repasse Mercado Pago')
  return String(d?.id ?? '')
}

async function transferStripe(apiKey: string, amount: number) {
  // Requer conta conectada (transfers). Mantemos esqueleto.
  const r = await fetch('https://api.stripe.com/v1/payouts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${apiKey}`,
    },
    body: new URLSearchParams({ amount: String(Math.round(amount * 100)), currency: 'brl' }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.error?.message || 'Falha payout Stripe')
  return d?.id as string
}

async function transferPagarme(apiKey: string, amount: number) {
  const auth = btoa(`${apiKey}:`)
  const r = await fetch('https://api.pagar.me/core/v5/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: Math.round(amount * 100) }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.message || 'Falha transferência Pagar.me')
  return String(d?.id ?? '')
}

async function runTransfer(provider: string, apiKey: string, amount: number, pixKey?: string) {
  switch (provider) {
    case 'asaas':       return transferAsaas(apiKey, amount, pixKey)
    case 'mercadopago': return transferMercadoPago(apiKey, amount, pixKey)
    case 'stripe':      return transferStripe(apiKey, amount)
    case 'pagarme':     return transferPagarme(apiKey, amount)
    default: throw new Error(`Provider ${provider} sem driver de repasse`)
  }
}

// ----- Main -----------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { booking_id } = await req.json()
    if (!booking_id) return ok({ error: 'booking_id required' }, 400)

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 1) Booking + pagamento + empresa + funcionário
    const { data: booking, error: bErr } = await supa
      .from('bookings')
      .select('id, company_id, employee_id, total_amount, payment_status')
      .eq('id', booking_id).single()
    if (bErr || !booking) return ok({ error: 'Booking não encontrado' }, 404)
    if (booking.payment_status !== 'confirmed') return ok({ error: 'Pagamento não confirmado' }, 400)

    const { data: company } = await supa
      .from('company_payment_settings')
      .select('own_gateway_provider, own_gateway_api_key_encrypted, autonomous_share_pct, payout_rule, payout_interval_days, payout_flow')
      .eq('company_id', booking.company_id).maybeSingle()

    if (!company) return ok({ error: 'Empresa sem gateway configurado' }, 400)

    const { data: employeeRow } = await supa
      .from('employees')
      .select('payout_flow_override')
      .eq('id', booking.employee_id).maybeSingle()

    const { data: employee } = await supa
      .from('employee_payment_settings')
      .select('provider, api_key_encrypted, pix_key, payout_rule, payout_interval_days, is_active')
      .eq('employee_id', booking.employee_id).maybeSingle()

    // Fluxo aplicado (override do employee > default da empresa)
    const payoutFlow: 'via_company' | 'direct_to_autonomous' =
      (employeeRow?.payout_flow_override as any) || (company.payout_flow as any) || 'via_company'

    const total = Number(booking.total_amount ?? 0)
    const sharePct = Number(company.autonomous_share_pct ?? 95)
    const amountEmp = +(total * sharePct / 100).toFixed(2)
    const amountCo = +(total - amountEmp).toFixed(2)

    // Quem TRANSFERE e quem RECEBE depende do fluxo:
    //  via_company         -> empresa transfere amountEmp para o autônomo
    //  direct_to_autonomous-> autônomo transfere amountCo para a empresa
    const sameGateway = employee?.is_active &&
      employee.provider === company.own_gateway_provider &&
      !!employee.api_key_encrypted

    const rule = employee?.payout_rule || company.payout_rule || 'per_service'
    let scheduledFor: string | null = null
    if (rule === 'end_of_day') {
      const d = new Date(); d.setHours(23, 59, 0, 0); scheduledFor = d.toISOString()
    } else if (rule === 'interval_days') {
      const days = employee?.payout_interval_days || company.payout_interval_days || 7
      const d = new Date(); d.setDate(d.getDate() + days); scheduledFor = d.toISOString()
    }

    // Quem precisa ter credenciais para executar a transferência:
    const senderHasKey = payoutFlow === 'via_company'
      ? !!company.own_gateway_api_key_encrypted
      : !!(employee?.is_active && employee?.api_key_encrypted)

    // 3) Registro inicial
    const { data: payoutRow, error: insErr } = await supa
      .from('autonomous_payouts')
      .insert({
        company_id: booking.company_id,
        employee_id: booking.employee_id,
        booking_id: booking.id,
        amount_total: total,
        amount_to_employee: amountEmp,
        amount_to_company: amountCo,
        company_provider: company.own_gateway_provider,
        employee_provider: employee?.provider || null,
        payout_flow: payoutFlow,
        mode: !senderHasKey ? 'pending' : (sameGateway ? 'native_split' : 'cross_gateway'),
        status: 'pending',
        scheduled_for: scheduledFor,
      })
      .select().single()
    if (insErr) return ok({ error: insErr.message }, 500)

    // 4) Sem credenciais do remetente -> pending manual
    if (!senderHasKey) {
      const msg = payoutFlow === 'via_company'
        ? 'Empresa sem gateway configurado — repasse pendente'
        : 'Autônomo sem gateway configurado — repasse pendente'
      return ok({ payout: payoutRow, message: msg })
    }
    if (scheduledFor) {
      return ok({ payout: payoutRow, message: `Agendado para ${scheduledFor} (job processa)` })
    }

    // 5) Cenário A: mesmo gateway -> split nativo já configurado na cobrança
    if (sameGateway) {
      await supa.from('autonomous_payouts').update({
        status: 'paid', paid_at: new Date().toISOString(),
      }).eq('id', payoutRow.id)
      return ok({ payout: payoutRow, mode: 'native_split', flow: payoutFlow })
    }

    // 6) Cenário B: cross-gateway -> dispara transferência
    //    via_company         => empresa transfere amountEmp para o autônomo
    //    direct_to_autonomous=> autônomo transfere amountCo para a empresa
    const senderProvider = payoutFlow === 'via_company'
      ? company.own_gateway_provider
      : employee!.provider
    const senderKey = payoutFlow === 'via_company'
      ? (company.own_gateway_api_key_encrypted || '').trim()
      : (employee!.api_key_encrypted || '').trim()
    const transferAmount = payoutFlow === 'via_company' ? amountEmp : amountCo
    const destinationPix = payoutFlow === 'via_company'
      ? (employee?.pix_key || undefined)
      : undefined // empresa deve ter PIX em settings — fora do MVP

    try {
      const externalId = await runTransfer(senderProvider, senderKey, transferAmount, destinationPix)
      await supa.from('autonomous_payouts').update({
        status: 'paid', external_payout_id: externalId, paid_at: new Date().toISOString(),
      }).eq('id', payoutRow.id)
      return ok({ payout: { ...payoutRow, external_payout_id: externalId }, mode: 'cross_gateway', flow: payoutFlow })
    } catch (e: any) {
      await supa.from('autonomous_payouts').update({
        status: 'failed', error_message: e.message,
      }).eq('id', payoutRow.id)
      return ok({ error: e.message, payout_id: payoutRow.id }, 500)
    }
  } catch (e: any) {
    console.error('process-autonomous-payout fatal', e)
    return ok({ error: e.message }, 500)
  }
})
