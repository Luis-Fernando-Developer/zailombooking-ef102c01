// Edge Function: marketing-notify
// Verify JWT: ATIVADO (chamada do frontend autenticado para disparar notificações).
// Cria registros em company_notifications (se existir) filtrando pela audience da campanha.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from "npm:zod@3";

const Body = z.object({
  campaignId: z.string().uuid(),
  scheduleAt: z.string().datetime().optional(),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(2000),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'no auth' }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: camp, error: ce } = await supabase
      .from('marketing_campaigns')
      .select('id, company_id, audience_type, audience_filters, name')
      .eq('id', parsed.data.campaignId)
      .single();
    if (ce || !camp) throw ce ?? new Error('campanha não encontrada');

    // Resolve destinatários
    let targetUserIds: string[] = [];
    if (camp.audience_type === 'clients' || camp.audience_type === 'all') {
      const { data } = await supabase.from('clients').select('user_id').eq('company_id', camp.company_id);
      targetUserIds.push(...(data ?? []).map((r: any) => r.user_id).filter(Boolean));
    }
    if (camp.audience_type === 'employees' || camp.audience_type === 'all_employees' || camp.audience_type === 'all') {
      const { data } = await supabase.from('employees').select('user_id').eq('company_id', camp.company_id);
      targetUserIds.push(...(data ?? []).map((r: any) => r.user_id).filter(Boolean));
    }
    if (camp.audience_type === 'segmented') {
      const f = (camp.audience_filters as Record<string, unknown>) ?? {};
      let q = supabase.from('employees').select('user_id').eq('company_id', camp.company_id);
      if (f.role) q = q.eq('role', f.role);
      if (f.unit) q = q.eq('unit', f.unit);
      if (f.status) q = q.eq('status', f.status);
      const { data } = await q;
      targetUserIds.push(...(data ?? []).map((r: any) => r.user_id).filter(Boolean));
    }

    targetUserIds = Array.from(new Set(targetUserIds));

    // Insere em company_notifications usando o schema real
    // (target_user_id + type obrigatório).
    let inserted = 0;
    try {
      const rows = targetUserIds.map((uid) => ({
        company_id: camp.company_id,
        target_user_id: uid,
        type: 'marketing',
        title: parsed.data.title,
        message: parsed.data.message,
        metadata: {
          campaign_id: camp.id,
          campaign_name: camp.name,
          scheduled_at: parsed.data.scheduleAt ?? null,
        },
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('company_notifications').insert(rows);
        if (error) console.error('marketing-notify insert error', error);
        else inserted = rows.length;
      }
    } catch (e) { console.error('marketing-notify insert exception', e); }

    await supabase.from('marketing_history').insert({
      company_id: camp.company_id, entity_type: 'notification', entity_id: camp.id,
      event: parsed.data.scheduleAt ? 'scheduled' : 'sent',
      payload: { recipients: targetUserIds.length, inserted },
    });

    return new Response(JSON.stringify({ ok: true, recipients: targetUserIds.length, inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
