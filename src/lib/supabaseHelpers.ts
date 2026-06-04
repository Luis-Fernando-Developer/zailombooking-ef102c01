/**
 * Helper para construir URLs de edge functions usando variáveis de ambiente.
 * Isso evita hardcoding e garante que o app use o backend correto.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function getEdgeFunctionUrl(functionName: string): string {
  if (!SUPABASE_URL) {
    console.error('VITE_SUPABASE_URL não está definida');
    throw new Error('Configuração de backend não encontrada');
  }
  return `${SUPABASE_URL}/functions/v1/${functionName}`;
}

export function getSupabaseUrl(): string {
  if (!SUPABASE_URL) {
    console.error('VITE_SUPABASE_URL não está definida');
    throw new Error('Configuração de backend não encontrada');
  }
  return SUPABASE_URL;
}
