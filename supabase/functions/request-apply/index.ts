// Deploy: supabase functions deploy request-apply --no-verify-jwt
// Dispatcher que aplica o efeito real após aprovação.
// Body: { request_id }
// Para cada request_type, executa a mutação correspondente (ex.: gravar escala).
// Novos request_types são adicionados aqui sem mexer em tabelas.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Handler = (sb: SupabaseClient, req: any) => Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  // Exemplo: escala em lote — grava employee_schedules para 1..N colaboradores
  schedule_change: async (sb, r) => {
    const payload = r.request_payload ?? {};
    const employees: string[] = payload.employees ?? [];
    const schedule = payload.new_schedule ?? [];
    if (!employees.length || !Array.isArray(schedule)) return { applied: 0 };
    let applied = 0;
    for (const empId of employees) {
      await sb.from('employee_schedules').delete().eq('employee_id', empId);
      const rows = schedule.map((s: any) => ({
        company_id: r.tenant_id, employee_id: empId,
        day_of_week: s.day_of_week, is_working: s.is_working,
        start_time: s.start_time, end_time: s.end_time,
        break_start: s.break_start ?? null, break_end: s.break_end ?? null,
      }));
      const { error } = await sb.from('employee_schedules').insert(rows);
      if (!error) applied++;
    }
    return { applied };
  },

  // Exemplo: ausência aprovada — grava em employee_absences
  absence_request: async (sb, r) => {
    const p = r.request_payload ?? {};
    const { error } = await sb.from('employee_absences').insert({
      company_id: r.tenant_id,
      employee_id: p.employee_id,
      absence_type: p.absence_type,
      start_date: p.start_date,
      end_date: p.end_date,
      reason: p.reason ?? null,
    });
    if (error) throw error;
    return { applied: 1 };
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return new Response(JSON.stringify({ error: 'missing_authorization' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const { request_id } = await req.json() ?? {};
    if (!request_id) return new Response(JSON.stringify({ error: 'request_id obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const { data: r, error } = await sb.from('requests').select('*').eq('id', request_id).single();
    if (error || !r) return new Response(JSON.stringify({ error: 'request_not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    if (!['approved', 'partially_approved'].includes(r.status)) {
      return new Response(JSON.stringify({ error: 'request_not_approved', status: r.status }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const handler = HANDLERS[r.request_type];
    if (!handler) {
      return new Response(JSON.stringify({ error: 'no_handler_for_type', type: r.request_type }), {
        status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await handler(sb, r);

    await sb.from('request_audit_log').insert({
      request_id, tenant_id: r.tenant_id, actor_id: user.id,
      action: 'applied', new_values: result as any,
    });

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('request-apply error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
