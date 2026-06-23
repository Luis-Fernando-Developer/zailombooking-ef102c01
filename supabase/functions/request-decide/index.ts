// Deploy: supabase functions deploy request-decide --no-verify-jwt
// Decide uma solicitação: approve | partial_approve | reject | request_revision | cancel
// Body: { request_id, decision, comment?, partial_decisions? }
//   - partial_decisions: objeto livre gravado em approval_flow (para aprovação linha-a-linha)
//
// Validação de role acontece via request_approval_rules.approver_roles (com fallback p/ owner/manager).

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return new Response(JSON.stringify({ error: 'missing_authorization' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const { request_id, decision, comment, partial_decisions } = await req.json() ?? {};
    if (!request_id || !decision || !(decision in DECISION_TO_STATUS)) {
      return new Response(JSON.stringify({ error: 'request_id e decision válidos obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: reqRow, error: getErr } = await supabase
      .from('requests').select('*').eq('id', request_id).single();
    if (getErr || !reqRow) return new Response(JSON.stringify({ error: 'request_not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const { data: emp } = await supabase
      .from('employees').select('role').eq('user_id', user.id).eq('company_id', reqRow.tenant_id).maybeSingle();
    const { data: comp } = await supabase
      .from('companies').select('owner_email').eq('id', reqRow.tenant_id).single();
    const isOwner = (comp?.owner_email ?? '').toLowerCase() === (user.email ?? '').toLowerCase();
    const actor_role = isOwner ? 'owner' : (emp?.role ?? 'employee');

    const { data: rule } = await supabase
      .from('request_approval_rules').select('*')
      .eq('tenant_id', reqRow.tenant_id).eq('request_type', reqRow.request_type).maybeSingle();
    const approverRoles: string[] = rule?.approver_roles ?? ['owner', 'manager'];

    // Cancelar pode ser feito pelo próprio criador OU por approver
    const canCancel = decision === 'cancel' && reqRow.created_by === user.id;
    const isApprover = approverRoles.includes(actor_role);
    if (!canCancel && !isApprover) {
      return new Response(JSON.stringify({ error: 'forbidden_role', actor_role, approverRoles }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newStatus = DECISION_TO_STATUS[decision as Decision];
    const patch: Record<string, unknown> = { status: newStatus };
    if (decision === 'approve' || decision === 'partial_approve') patch.approved_by = user.id;
    if (decision === 'reject') patch.rejected_by = user.id;
    if (decision === 'request_revision') patch.revision_requested_by = user.id;
    if (['approved', 'partially_approved', 'rejected', 'cancelled'].includes(newStatus)) {
      patch.resolved_at = new Date().toISOString();
    }
    if (partial_decisions) {
      patch.approval_flow = { ...(reqRow.approval_flow ?? {}), partial_decisions };
    }

    const { data: updated, error: updErr } = await supabase
      .from('requests').update(patch).eq('id', request_id).select('*').single();
    if (updErr) throw updErr;

    const scheduleId = reqRow.request_type === 'schedule_change'
      ? reqRow.request_payload?.schedule_id
      : null;
    if (decision === 'request_revision' && scheduleId) {
      await supabase.from('schedules').update({
        status: 'revision_requested',
        revision_requested_by: user.id,
        revision_requested_at: new Date().toISOString(),
        revision_reason: comment ?? null,
      }).eq('id', scheduleId).eq('tenant_id', reqRow.tenant_id);
    }

    await supabase.from('request_audit_log').insert({
      request_id, tenant_id: reqRow.tenant_id, actor_id: user.id, actor_role,
      action: decision, old_values: reqRow, new_values: updated,
      ip: req.headers.get('x-forwarded-for') ?? null,
    });

    if (comment) {
      await supabase.from('request_comments').insert({
        request_id, author_id: user.id, author_role: actor_role, message: comment,
      });
    }

    return new Response(JSON.stringify({ request: updated }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('request-decide error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
