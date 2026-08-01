// Edge Function: super-admin-manage-instance
// Aceita POST { action: 'logout' | 'delete', name: string }
// - logout: desconecta a instancia (Evolution: DELETE /instance/logout/:name)
// - delete: desconecta (se conectada) e deleta a instancia na Evolution +
//   remove o registro em whatsapp_instances quando existir.
//
// Requer secrets:
//   EVOLUTION_GLOBAL_BASE_URL, EVOLUTION_GLOBAL_API_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from 'npm:@supabase/supabase-js@2';
// ---------------------------------------------------------------------------
// Inlined de _shared/gateway-config.ts — o editor do painel Supabase não
// resolve imports relativos fora da pasta da própria função.
// Ordem: variável de ambiente -> tabela public.super_admin_gateway_configs.
// ---------------------------------------------------------------------------
async function getGatewayConfig(
  adminClient: any,
  provider: string,
  key: string,
): Promise<string | undefined> {
  const envValue = (Deno.env.get(key) ?? '').trim();
  if (envValue) return envValue;

  const { data, error } = await adminClient
    .from('super_admin_gateway_configs')
    .select('value')
    .eq('provider', provider)
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`[gateway-config] erro ao ler ${provider}/${key}:`, error.message);
    return undefined;
  }
  return data?.value?.trim() || undefined;
}

async function getGatewayConfigFirst(
  adminClient: any,
  provider: string,
  keys: string[],
): Promise<string | undefined> {
  for (const key of keys) {
    const value = await getGatewayConfig(adminClient, provider, key);
    if (value) return value;
  }
  return undefined;
}

async function getEvolutionBaseUrl(adminClient: any): Promise<string | undefined> {
  const value = await getGatewayConfigFirst(adminClient, 'whatsapp', [
    'EVOLUTION_GLOBAL_BASE_URL',
    'EVOLUTION_GLOBAL_URL',
    'EVOLUTION_MANAGER_URL',
  ]);
  return value?.replace(/\/$/, '');
}

async function getEvolutionApiKey(adminClient: any): Promise<string | undefined> {
  return getGatewayConfigFirst(adminClient, 'whatsapp', [
    'EVOLUTION_GLOBAL_API_KEY',
    'EVOLUTION_MANAGER_KEY',
  ]);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

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

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '').toLowerCase();
    const name = String(body.name ?? '').trim();

    if (!name) return json({ error: 'missing_name' }, 400);
    if (!['logout', 'delete'].includes(action)) return json({ error: 'invalid_action' }, 400);

    const evoUrl = await getEvolutionBaseUrl(service);
    const evoKey = await getEvolutionApiKey(service);
    if (!evoUrl || !evoKey) return json({ error: 'evolution_not_configured' }, 500);

    const evoFetch = (path: string, method: string) =>
      fetch(`${evoUrl}${path}`, {
        method,
        headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      });

    const results: Record<string, unknown> = { name, action };

    // Sempre tenta logout primeiro; Evolution ignora se ja estiver desconectada.
    const logoutRes = await evoFetch(`/instance/logout/${encodeURIComponent(name)}`, 'DELETE');
    results.logout_status = logoutRes.status;
    if (!logoutRes.ok && logoutRes.status !== 404) {
      const t = await logoutRes.text();
      results.logout_body = t;
    }

    if (action === 'delete') {
      const delRes = await evoFetch(`/instance/delete/${encodeURIComponent(name)}`, 'DELETE');
      results.delete_status = delRes.status;
      if (!delRes.ok && delRes.status !== 404) {
        const t = await delRes.text();
        return json({ error: 'evolution_delete_failed', status: delRes.status, body: t }, 502);
      }
      // Remove registro local se existir
      const { error: dbErr } = await service
        .from('whatsapp_instances')
        .delete()
        .eq('name', name);
      if (dbErr) results.db_error = dbErr.message;
      else results.db_deleted = true;
    }

    return json({ success: true, ...results });
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
