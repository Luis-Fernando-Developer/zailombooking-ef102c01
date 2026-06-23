// Edge Function: marketing-revoke
// Verify JWT: ATIVADO. Permite a setores autorizados revogar uma campanha em andamento.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from "npm:zod@3";

const Body = z.object({
  campaignId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

const ALLOWED_ROLES = new Set(['owner', 'manager', 'rh', 'marketing']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'no auth' }), { status: 401, headers: corsHeaders });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: corsHeaders });

    const { data: camp } = await supabase.from('marketing_campaigns').select('id, company_id').eq('id', parsed.data.campaignId).single();
    if (!camp) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: corsHeaders });

    const { data: company } = await supabase.from('companies').select('owner_email').eq('id', camp.company_id).single();
    let role = 'employee';
    if (company?.owner_email?.toLowerCase() === user.email?.toLowerCase()) role = 'owner';
    else {
      const { data: emp } = await supabase.from('employees').select('role').eq('company_id', camp.company_id).eq('user_id', user.id).maybeSingle();
      role = emp?.role ?? 'employee';
    }
    if (!ALLOWED_ROLES.has(role)) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    await supabase.from('marketing_campaigns').update({
      status: 'cancelled',
      cancelled_reason: parsed.data.reason,
      cancelled_by: user.id,
      cancelled_at: new Date().toISOString(),
    }).eq('id', parsed.data.campaignId);

    await supabase.from('marketing_history').insert({
      company_id: camp.company_id, entity_type: 'campaign', entity_id: camp.id,
      event: 'revoked', actor_id: user.id, actor_role: role,
      payload: { reason: parsed.data.reason },
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
