// Edge Function: marketing-publish-scheduler
// Verify JWT: DESATIVADO (executar via cron pg_cron ou agendador externo).
// Função: ativa campanhas cujo start_at <= now() e status in (approved, scheduled);
//          encerra campanhas cujo end_at <= now() e status in (active, scheduled, approved).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date().toISOString();
  let activated = 0, ended = 0;

  try {
    // Ativar
    const { data: toActivate, error: e1 } = await supabase
      .from('marketing_campaigns')
      .update({ status: 'active' })
      .in('status', ['approved', 'scheduled'])
      .lte('start_at', now)
      .or(`end_at.is.null,end_at.gt.${now}`)
      .select('id');
    if (e1) throw e1;
    activated = toActivate?.length ?? 0;

    // Encerrar
    const { data: toEnd, error: e2 } = await supabase
      .from('marketing_campaigns')
      .update({ status: 'ended' })
      .in('status', ['active', 'scheduled', 'approved'])
      .not('end_at', 'is', null)
      .lte('end_at', now)
      .select('id, company_id');
    if (e2) throw e2;
    ended = toEnd?.length ?? 0;

    // Log
    if (toEnd && toEnd.length > 0) {
      await supabase.from('marketing_history').insert(
        toEnd.map((c: any) => ({ company_id: c.company_id, entity_type: 'campaign', entity_id: c.id, event: 'auto_ended' }))
      );
    }

    return new Response(JSON.stringify({ ok: true, activated, ended, ranAt: now }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
