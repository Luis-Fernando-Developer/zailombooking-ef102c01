// Deploy: supabase functions deploy schedule-submit --no-verify-jwt
// Promove schedule de 'draft' para 'pending_approval' e cria uma request vinculada.
// Body: { tenant_id, schedule_id, title?, description? }

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'missing_authorization' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return json({ error: 'invalid_token' }, 401);

    const { tenant_id, schedule_id, title, description } = await req.json();
    if (!tenant_id || !schedule_id) return json({ error: 'tenant_id, schedule_id obrigatórios' }, 400);

    const { data: belongs } = await supabase.rpc('user_belongs_to_company', {
      _user_id: user.id, _company_id: tenant_id,
    });
    if (!belongs) return json({ error: 'forbidden' }, 403);

    const { data: schedule, error: sErr } = await supabase
      .from('schedules').select('*').eq('id', schedule_id).eq('tenant_id', tenant_id).single();
    if (sErr || !schedule) return json({ error: 'schedule_not_found' }, 404);
    if (schedule.status !== 'draft') return json({ error: 'schedule_not_draft' }, 400);

    const { count: entriesCount } = await supabase
      .from('schedule_entries').select('id', { count: 'exact', head: true })
      .eq('schedule_id', schedule_id);

    const { data: emp } = await supabase
      .from('employees').select('role').eq('user_id', user.id).eq('company_id', tenant_id).maybeSingle();
    const actor_role = emp?.role ?? 'owner';

    const reqTitle = title || `Escala ${schedule.name}`;
    const reqDesc  = description || `Alteração de escala referente ao período ${schedule.period_start} → ${schedule.period_end}. Entries: ${entriesCount ?? 0}.`;

    const { data: created, error: rErr } = await supabase.from('requests').insert({
      tenant_id, request_type: 'schedule_change',
      title: reqTitle, description: reqDesc,
      priority: 'normal',
      created_by: user.id, status: 'pending',
      request_payload: { schedule_id, period_start: schedule.period_start, period_end: schedule.period_end, entries_count: entriesCount ?? 0 },
      audit_metadata: { source: 'schedule-submit' },
    }).select('*').single();
    if (rErr) throw rErr;

    await supabase.from('schedules')
      .update({ status: 'pending_approval', request_id: created.id })
      .eq('id', schedule_id);

    await supabase.from('request_audit_log').insert({
      request_id: created.id, tenant_id, actor_id: user.id, actor_role,
      action: 'created', new_values: { schedule_id },
    });

    return json({ ok: true, request: created });
  } catch (e) {
    console.error('schedule-submit', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
