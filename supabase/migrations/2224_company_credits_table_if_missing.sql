-- 2224: restaura a tabela de créditos usada pelo painel administrativo caso não exista.
-- IF NOT EXISTS preserva integralmente uma tabela já existente.
CREATE TABLE IF NOT EXISTS public.company_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  original_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '365 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_credits_company_created
  ON public.company_credits(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_credits_active_expiry
  ON public.company_credits(company_id, status, expires_at);

ALTER TABLE public.company_credits ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.company_credits TO authenticated;
GRANT ALL ON public.company_credits TO service_role;

DROP POLICY IF EXISTS "Super admins manage company credits" ON public.company_credits;
CREATE POLICY "Super admins manage company credits"
  ON public.company_credits
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
