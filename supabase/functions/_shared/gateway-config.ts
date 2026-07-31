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
