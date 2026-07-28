// Edge Function: super-admin-list-instances
// Lista todas as instancias do Evolution Manager (global), enriquecidas
// com o company_id da tabela whatsapp_instances quando existir.
//
// Requer secrets:
//   EVOLUTION_MANAGER_URL   (ex: https://evo.zailom.com)
//   EVOLUTION_MANAGER_KEY   (key global do painel Evolution)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth: exige JWT valido + role super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await supa.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);

    const userId = claims.claims.sub as string;

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: isAdmin } = await service.rpc('has_role', {
      _user_id: userId,
      _role: 'super_admin',
    });
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    const evoUrl = (Deno.env.get('EVOLUTION_MANAGER_URL') ?? '').replace(/\/$/, '');
    const evoKey = Deno.env.get('EVOLUTION_MANAGER_KEY');
    if (!evoUrl || !evoKey) return json({ error: 'evolution_not_configured' }, 500);

    const r = await fetch(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      const body = await r.text();
      return json({ error: 'evolution_error', status: r.status, body }, r.status);
    }
    const raw = await r.json();
    const list: any[] = Array.isArray(raw) ? raw : (raw?.instances ?? []);

    // Enriquecer com company_id
    const names = list.map((i) =>
      i?.instance?.instanceName ?? i?.instanceName ?? i?.name ?? null,
    ).filter(Boolean);

    let owners: Record<string, { company_id: string; company_name: string | null }> = {};
    if (names.length) {
      const { data } = await service
        .from('whatsapp_instances')
        .select('name, company_id, companies!inner(name)')
        .in('name', names);
      (data ?? []).forEach((row: any) => {
        owners[row.name] = {
          company_id: row.company_id,
          company_name: row.companies?.name ?? null,
        };
      });
    }

    const enriched = list.map((raw) => {
      const inst = raw?.instance ?? raw;
      const name = inst.instanceName ?? inst.name ?? null;
      const status = inst.status ?? inst.state ?? inst.connectionStatus ?? 'unknown';
      const number =
        inst.number ?? inst.owner ?? inst.wa_number ?? inst.msisdn ?? inst.ownerJid ?? null;
      const updatedAt =
        inst.updated_at ?? inst.updatedAt ?? inst.connectedAt ?? inst.disconnectedAt ?? null;
      return {
        name,
        status,
        number,
        updated_at: updatedAt,
        profileName: inst.profileName ?? inst.pushName ?? null,
        profilePicUrl: inst.profilePicUrl ?? null,
        owner: name ? owners[name] ?? null : null,
        raw: inst,
      };
    });

    return json({ instances: enriched, total: enriched.length });
  } catch (e) {
    return json({ error: 'internal', message: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
