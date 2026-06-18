// Deploy: supabase functions deploy schedule-generate --no-verify-jwt
// Gera schedule_entries automaticamente para um schedule (draft) usando:
// - schedule_templates.pattern_days (ciclo)
// - business_hours (fallback)
// - employee_absences aprovadas no período → entry_type='A'
// - employees.is_active=false → entry_type='D'
//
// Body: { tenant_id, schedule_id, template_id?, employee_ids: string[] }

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface PatternDay {
  work: boolean;
  start?: string; end?: string;
  break_start?: string | null; break_end?: string | null;
}

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

    const body = await req.json();
    const { tenant_id, schedule_id, template_id, employee_ids } = body ?? {};
    if (!tenant_id || !schedule_id || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return json({ error: 'tenant_id, schedule_id, employee_ids[] obrigatórios' }, 400);
    }

    const { data: belongs } = await supabase.rpc('user_belongs_to_company', {
      _user_id: user.id, _company_id: tenant_id,
    });
    if (!belongs) return json({ error: 'forbidden' }, 403);

    const { data: schedule, error: schErr } = await supabase
      .from('schedules').select('*').eq('id', schedule_id).eq('tenant_id', tenant_id).single();
    if (schErr || !schedule) return json({ error: 'schedule_not_found' }, 404);
    if (schedule.status !== 'draft') return json({ error: 'schedule_not_draft' }, 400);

    // Carrega template (opcional)
    let pattern: PatternDay[] | null = null;
    let cycleLen = 7;
    if (template_id) {
      const { data: tpl } = await supabase
        .from('schedule_templates').select('pattern_days, cycle_length_days')
        .eq('id', template_id).eq('tenant_id', tenant_id).maybeSingle();
      if (tpl) { pattern = tpl.pattern_days as PatternDay[]; cycleLen = tpl.cycle_length_days || 7; }
    }

    // Fallback: business_hours por dia da semana
    const { data: bhRows } = await supabase
      .from('business_hours').select('*').eq('company_id', tenant_id);
    const bhByDow = new Map<number, any>();
    (bhRows ?? []).forEach((b: any) => bhByDow.set(b.day_of_week, b));

    // Ausências aprovadas no período
    const { data: absences } = await supabase
      .from('employee_absences').select('*')
      .in('employee_id', employee_ids)
      .lte('start_date', schedule.period_end)
      .gte('end_date', schedule.period_start);

    // Employees (para detectar inativos)
    const { data: emps } = await supabase
      .from('employees').select('id, is_active').in('id', employee_ids);
    const inactiveSet = new Set((emps ?? []).filter((e: any) => !e.is_active).map((e: any) => e.id));

    // Gera entries
    const start = new Date(schedule.period_start + 'T00:00:00');
    const end   = new Date(schedule.period_end   + 'T00:00:00');
    const rows: any[] = [];
    let cycleIdx = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1), cycleIdx++) {
      const isoDate = d.toISOString().slice(0, 10);
      const dow = d.getDay();

      for (const empId of employee_ids) {
        let entryType: string = 'F';
        let st: string | null = null, et: string | null = null, bs: string | null = null, be: string | null = null;

        // Desligado
        if (inactiveSet.has(empId)) {
          entryType = 'D';
        } else if ((absences ?? []).some((a: any) =>
          a.employee_id === empId && isoDate >= a.start_date && isoDate <= a.end_date)) {
          entryType = 'A';
        } else if (pattern && pattern.length > 0) {
          const p = pattern[cycleIdx % cycleLen] ?? pattern[0];
          if (p.work) { entryType = 'T'; st = p.start ?? null; et = p.end ?? null; bs = p.break_start ?? null; be = p.break_end ?? null; }
          else { entryType = 'F'; }
        } else {
          const bh = bhByDow.get(dow);
          if (bh && bh.is_open) { entryType = 'T'; st = bh.open_time; et = bh.close_time; }
          else { entryType = 'F'; }
        }

        rows.push({
          schedule_id, employee_id: empId, entry_date: isoDate,
          entry_type: entryType, start_time: st, end_time: et,
          break_start: bs, break_end: be, decision_status: 'pending',
        });
      }
    }

    // Limpa entries existentes e insere novos
    await supabase.from('schedule_entries').delete().eq('schedule_id', schedule_id);
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const { error } = await supabase.from('schedule_entries').insert(rows.slice(i, i + chunkSize));
      if (error) throw error;
    }

    return json({ ok: true, inserted: rows.length });
  } catch (e) {
    console.error('schedule-generate', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
