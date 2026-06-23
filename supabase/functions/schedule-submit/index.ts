// Deploy: supabase functions deploy schedule-submit --no-verify-jwt
// Submete escala para aprovação com notificações DIRECIONADAS.
// Body: {
//   tenant_id, schedule_id,
//   target_mode: 'levels_above' | 'specific_users',
//   target_user_ids?: string[],   // obrigatório se 'specific_users'
//   title?, description?
// }

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'missing_authorization' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Cliente com o JWT do usuário — necessário para RPCs que usam auth.uid()
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );

    const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !user) return json({ error: 'invalid_token' }, 401);

    const {
      tenant_id, schedule_id,
      target_mode = 'levels_above',
      target_user_ids = [],
      title, description,
    } = await req.json();

    if (!tenant_id || !schedule_id) return json({ error: 'tenant_id e schedule_id obrigatórios' }, 400);
    if (!['levels_above', 'specific_users'].includes(target_mode)) {
      return json({ error: 'target_mode inválido' }, 400);
    }
    if (target_mode === 'specific_users' && (!Array.isArray(target_user_ids) || target_user_ids.length === 0)) {
      return json({ error: 'Selecione ao menos um destinatário' }, 400);
    }

    const { data: belongs } = await admin.rpc('user_belongs_to_company', {
      _user_id: user.id, _company_id: tenant_id,
    });
    if (!belongs) return json({ error: 'forbidden', detail: 'user_not_in_company', user_id: user.id, tenant_id }, 403);

    const { data: canCreate } = await admin.rpc('user_can_create_schedule', {
      _user_id: user.id, _company_id: tenant_id,
    });
    if (!canCreate) {
      // Diagnóstico: o usuário não tem system_profile_id na employees,
      // ou o perfil dele não tem can_create_schedule = true.
      const { data: emp } = await admin.from('employees')
        .select('id, system_profile_id, role')
        .eq('user_id', user.id).eq('company_id', tenant_id).maybeSingle();
      return json({
        error: 'forbidden_no_create_permission',
        detail: 'Seu perfil de sistema não tem permissão para criar/enviar escalas. Peça ao admin para definir seu Perfil do Sistema (ENCARREGADO, GERENTE, etc.).',
        employee: emp,
      }, 403);
    }

    const { data: schedule, error: sErr } = await admin
      .from('schedules').select('*').eq('id', schedule_id).eq('tenant_id', tenant_id).single();
    if (sErr || !schedule) return json({ error: 'schedule_not_found' }, 404);
    if (!['draft', 'revision_requested'].includes(schedule.status)) {
      return json({ error: 'schedule_not_submittable', status: schedule.status }, 400);
    }

    // Resolver destinatários (RPC depende de auth.uid() → usa cliente do usuário)
    let recipients: string[] = [];
    if (target_mode === 'levels_above') {
      const { data: above } = await asUser.rpc('list_approvers_above', { _company_id: tenant_id });
      recipients = Array.from(new Set((above ?? []).map((r: any) => r.user_id))).filter(Boolean);
    } else {
      const { data: above } = await asUser.rpc('list_approvers_above', { _company_id: tenant_id });
      const allowed = new Set((above ?? []).map((r: any) => r.user_id));
      recipients = target_user_ids.filter((id: string) => allowed.has(id));
      if (recipients.length === 0) {
        return json({
          error: 'no_valid_recipients',
          detail: 'Os destinatários selecionados não foram reconhecidos como aprovadores acima do seu nível.',
          debug: { allowed_count: allowed.size, requested: target_user_ids },
        }, 400);
      }
    }

    // Criar request vinculada
    const reqTitle = title || `Escala: ${schedule.name}`;
    const reqDesc  = description || `Aprovação de escala — período ${schedule.period_start} → ${schedule.period_end}.`;
    const { data: created, error: rErr } = await admin.from('requests').insert({
      tenant_id, request_type: 'schedule_change',
      title: reqTitle, description: reqDesc,
      priority: 'normal',
      created_by: user.id, status: 'pending',
      request_payload: { schedule_id, target_mode, target_user_ids: recipients },
      audit_metadata: { source: 'schedule-submit' },
    }).select('*').single();
    if (rErr) throw rErr;

    // Atualizar escala
    await admin.from('schedules').update({
      status: 'pending_approval',
      request_id: created.id,
      submitted_to_user_ids: recipients,
      submitted_to_levels: target_mode === 'levels_above',
    }).eq('id', schedule_id);

    // Audit log
    await admin.from('schedule_audit_log').insert({
      schedule_id, tenant_id, action: 'submitted', actor_user_id: user.id,
      snapshot: { target_mode, recipients_count: recipients.length },
    });

    // Notificações direcionadas
    if (recipients.length > 0) {
      const link = `/admin/solicitacoes?request=${created.id}`;
      const notifs = recipients.map((uid) => ({
        company_id: tenant_id,
        type: 'schedule_request',
        title: 'Nova escala para aprovação',
        message: `${schedule.name} (${schedule.period_start} → ${schedule.period_end})`,
        link,
        target_user_id: uid,
        metadata: { schedule_id, request_id: created.id },
      }));
      await admin.from('company_notifications').insert(notifs);
    }

    return json({ ok: true, request: created, recipients_count: recipients.length });
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
