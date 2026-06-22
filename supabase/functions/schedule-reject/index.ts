// Deploy: supabase functions deploy schedule-reject --no-verify-jwt
// Body: { tenant_id, schedule_id, reason }  (reason obrigatório)
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (!jwt) return j({ error: 'missing_authorization' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return j({ error: 'invalid_token' }, 401);

    const { tenant_id, schedule_id, reason } = await req.json();
    if (!tenant_id || !schedule_id || !reason?.trim()) {
      return j({ error: 'tenant_id, schedule_id e reason obrigatórios' }, 400);
    }

    const { data: canApprove } = await admin.rpc('user_can_approve_schedule', {
      _user_id: user.id, _schedule_id: schedule_id,
    });
    if (!canApprove) return j({ error: 'forbidden_cannot_approve' }, 403);

    const { data: schedule } = await admin.from('schedules').select('*').eq('id', schedule_id).single();
    if (!schedule) return j({ error: 'schedule_not_found' }, 404);
    if (schedule.status !== 'pending_approval') return j({ error: 'invalid_status' }, 400);

    await admin.from('schedules').update({
      status: 'rejected', rejected_by: user.id, rejected_at: new Date().toISOString(),
      rejection_reason: reason,
    }).eq('id', schedule_id);

    await admin.from('schedule_audit_log').insert({
      schedule_id, tenant_id, action: 'rejected', actor_user_id: user.id, reason,
    });

    if (schedule.created_by) {
      await admin.from('company_notifications').insert({
        company_id: tenant_id, type: 'schedule_rejected',
        title: 'Escala rejeitada',
        message: `${schedule.name}: ${reason}`,
        link: `/admin/solicitacoes?request=${schedule.request_id ?? ''}`,
        target_user_id: schedule.created_by,
        metadata: { schedule_id },
      });
    }
    return j({ ok: true });
  } catch (e) {
    console.error('schedule-reject', e);
    return j({ error: (e as Error).message }, 500);
  }
});
function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
