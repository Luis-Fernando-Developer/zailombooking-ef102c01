-- ============================================================================
-- 2046 — Public REST API: chaves de autenticação por empresa
--
-- Cria a infraestrutura mínima para que a edge function `public-api`
-- autentique consumidores externos (Zailom Flow, apps mobile, integrações
-- de terceiros) por meio de uma API Key vinculada a uma empresa.
--
-- Toda regra de negócio permanece no Booking (RPCs/tabelas existentes).
-- Esta migração NÃO duplica nenhuma regra: apenas armazena credenciais.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  key_prefix    text NOT NULL,                -- 8 primeiros chars, visíveis
  key_hash      text NOT NULL UNIQUE,         -- sha256 hex do segredo completo
  scopes        text[] NOT NULL DEFAULT ARRAY['read','write']::text[],
  is_active     boolean NOT NULL DEFAULT true,
  last_used_at  timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_company ON public.api_keys(company_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON public.api_keys(key_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_tenant_all" ON public.api_keys;
CREATE POLICY "api_keys_tenant_all" ON public.api_keys
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

-- Resolve uma API key (hash sha256) para a company_id vinculada,
-- atualizando last_used_at. Usada exclusivamente pela edge `public-api`
-- via service_role. Retorna NULL se inválida/revogada.
CREATE OR REPLACE FUNCTION public.resolve_api_key(p_hash text)
RETURNS TABLE(company_id uuid, scopes text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.api_keys
     SET last_used_at = now()
   WHERE key_hash = p_hash
     AND is_active = true
     AND revoked_at IS NULL
  RETURNING api_keys.company_id, api_keys.scopes;
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_api_key(text) TO service_role;
