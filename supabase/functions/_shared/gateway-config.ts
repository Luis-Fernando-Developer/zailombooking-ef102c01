// Helper para leitura de configurações de gateway.
// Ordem de prioridade:
//   1. Variável de ambiente (Deno.env.get) — ideal para secrets do Supabase.
//   2. Tabela public.super_admin_gateway_configs (fallback via UI super admin).

export async function getGatewayConfig(
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

export async function getGatewayConfigBool(
  adminClient: any,
  provider: string,
  key: string,
): Promise<boolean> {
  const value = await getGatewayConfig(adminClient, provider, key);
  if (!value) return false;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

// Tenta uma lista ordenada de chaves (env primeiro, depois tabela) e retorna a primeira preenchida.
export async function getGatewayConfigFirst(
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

// Helpers específicos para Evolution API, que aceita múltiplos nomes de variável legados.
export async function getEvolutionBaseUrl(adminClient: any): Promise<string | undefined> {
  const value = await getGatewayConfigFirst(adminClient, 'whatsapp', [
    'EVOLUTION_GLOBAL_BASE_URL',
    'EVOLUTION_GLOBAL_URL',
    'EVOLUTION_MANAGER_URL',
  ]);
  return value?.replace(/\/$/, '');
}

export async function getEvolutionApiKey(adminClient: any): Promise<string | undefined> {
  return getGatewayConfigFirst(adminClient, 'whatsapp', [
    'EVOLUTION_GLOBAL_API_KEY',
    'EVOLUTION_MANAGER_KEY',
  ]);
}
