// Deploy: supabase functions deploy request-decide --no-verify-jwt
// Decide uma solicitação: approve | partial_approve | reject | request_revision | cancel
// Body: { request_id, decision, comment?, partial_decisions? }

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Decision = 'approve' | 'partial_approve' | 'reject' | 'request_revision' | 'cancel';

const DECISION_TO_STATUS: Record<Decision, string> = {
  approve: 'approved',
  partial_approve: 'partially_approved',
  reject: 'rejected',
  request_revision: 'in_review',
  cancel: 'cancelled',
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let step = 'init';
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return j({ error: 'missing_authorization' }, 401);

    step = 'create_client';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    step = 'auth_getUser';
    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return j({ error: 'invalid_token', detail: userErr?.message }, 401);

    step = 'parse_body';
    const body = await req.json().catch(() => ({}));
    const { request_id, decision, comment, partial_decisions } = body ?? {};
    if (!request_id || !decision || !(decision in DECISION_TO_STATUS)) {
      return j({ error: 'request_id e decision válidos obrigatórios' }, 400);
    }

    step = 'fetch_request';
    const { data: reqRow, error: getErr } = await supabase
      .from('requests').select('*').eq('id', request_id).single();
    if (getErr || !reqRow) return j({ error: 'request_not_found', detail: getErr?.message }, 404);

    step = 'fetch_role';
    const { data: emp } = await supabase
      .from('employees').select('role').eq('user_id', user.id).eq('company_id', reqRow.tenant_id).maybeSingle();
    const { data: comp } = await supabase
      .from('companies').select('owner_email').eq('id', reqRow.tenant_id).single();
    const isOwner = (comp?.owner_email ?? '').toLowerCase() === (user.email ?? '').toLowerCase();
    const actor_role = isOwner ? 'owner' : (emp?.role ?? 'employee');

    step = 'fetch_rule';
    const { data: rule } = await supabase
      .from('request_approval_rules').select('*')
      .eq('tenant_id', reqRow.tenant_id).eq('request_type', reqRow.request_type).maybeSingle();
    const approverRoles: string[] = rule?.approver_roles ?? ['owner', 'manager'];

    const canCancel = decision === 'cancel' && reqRow.created_by === user.id;
    const isApprover = approverRoles.includes(actor_role);
    if (!canCancel && !isApprover) {
      return j({ error: 'forbidden_role', actor_role, approverRoles }, 403);
    }

    step = 'build_patch';
    const newStatus = DECISION_TO_STATUS[decision as Decision];
    const patch: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
    if (decision === 'approve' || decision === 'partial_approve') patch.approved_by = user.id;
    if (decision === 'reject') patch.rejected_by = user.id;
    if (decision === 'request_revision') patch.revision_requested_by = user.id;
    if (['approved', 'partially_approved', 'rejected', 'cancelled'].includes(newStatus)) {
      patch.resolved_at = new Date().toISOString();
    }
    if (partial_decisions) {
      patch.approval_flow = { ...(reqRow.approval_flow ?? {}), partial_decisions };
    }

    step = 'update_request';
    const { data: updated, error: updErr } = await supabase
      .from('requests').update(patch).eq('id', request_id).select('*').single();
    if (updErr) return j({ error: 'update_request_failed', step, detail: updErr.message }, 500);

    // Se for schedule_change, propaga a decisão para a escala
    const scheduleId = reqRow.request_type === 'schedule_change'
      ? reqRow.request_payload?.schedule_id
      : null;

    if (scheduleId) {
      step = 'update_schedule';
      const schedPatch: Record<string, unknown> = {};
      if (decision === 'approve') {
        schedPatch.status = 'approved';
        schedPatch.approved_by = user.id;
        schedPatch.approved_at = new Date().toISOString();
      } else if (decision === 'reject') {
        schedPatch.status = 'rejected';
        schedPatch.rejected_by = user.id;
        schedPatch.rejected_at = new Date().toISOString();
        schedPatch.rejection_reason = comment ?? null;
      } else if (decision === 'request_revision') {
        schedPatch.status = 'revision_requested';
        schedPatch.revision_requested_by = user.id;
        schedPatch.revision_requested_at = new Date().toISOString();
        schedPatch.revision_reason = comment ?? null;
      }
      if (Object.keys(schedPatch).length > 0) {
        const { error: sErr } = await supabase.from('schedules')
          .update(schedPatch).eq('id', scheduleId).eq('tenant_id', reqRow.tenant_id);
        if (sErr) {
          console.error('schedule update failed', sErr);
          // não bloqueia — apenas registra
        }
      }
    }

    step = 'audit_log';
    const { error: auditErr } = await supabase.from('request_audit_log').insert({
      request_id, tenant_id: reqRow.tenant_id, actor_id: user.id, actor_role,
      action: decision, old_values: reqRow, new_values: updated,
      ip: req.headers.get('x-forwarded-for') ?? null,
    });
    if (auditErr) console.error('audit_log insert failed', auditErr);

    if (comment) {
      step = 'insert_comment';
      const { error: cErr } = await supabase.from('request_comments').insert({
        request_id, author_id: user.id, author_role: actor_role, message: comment,
      });
      if (cErr) console.error('comment insert failed', cErr);
    }

    return j({ request: updated });
  } catch (e) {
    console.error('request-decide error at step', step, e);
    return j({ error: (e as Error).message, step }, 500);
  }
});
