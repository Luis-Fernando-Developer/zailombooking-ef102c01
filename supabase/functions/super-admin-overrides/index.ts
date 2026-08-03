import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { company_id, action, days, until } = await req.json()
    if (!company_id) throw new Error("company_id required")

    if (action === 'release_resources') {
      const releaseUntil = until || new Date(Date.now() + (days || 7) * 86400000).toISOString()
      
      const { error } = await supabaseClient
        .from('companies')
        .update({ 
          manual_resource_release_until: releaseUntil,
          status: 'active' 
        })
        .eq('id', company_id)

      if (error) throw error

      await supabaseClient
        .from('company_subscriptions')
        .update({ billing_status: 'active', status: 'active' })
        .eq('company_id', company_id)

      return new Response(JSON.stringify({ success: true, until: releaseUntil }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'force_early_renewal') {
      const { error } = await supabaseClient
        .from('companies')
        .update({ force_early_renewal_once: true })
        .eq('id', company_id)

      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error("Invalid action")
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
