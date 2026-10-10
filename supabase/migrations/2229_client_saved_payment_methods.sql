-- Carteira de cartões Zailom: guarda apenas token do gateway e metadados.
-- Nunca armazena PAN completo ou CVV.
CREATE TABLE IF NOT EXISTS public.client_saved_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('asaas', 'mercadopago', 'stripe', 'pagarme')),
  gateway_account_fingerprint TEXT NOT NULL,
  gateway_customer_id TEXT NOT NULL,
  provider_token TEXT NOT NULL,
  card_brand TEXT,
  card_last4 TEXT NOT NULL CHECK (card_last4 ~ '^[0-9]{4}$'),
  expiry_month SMALLINT CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year SMALLINT CHECK (expiry_year BETWEEN 2024 AND 2200),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_saved_payment_methods_owner
  ON public.client_saved_payment_methods (company_id, client_id, provider, gateway_account_fingerprint);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_saved_payment_methods_default
  ON public.client_saved_payment_methods (company_id, client_id, provider, gateway_account_fingerprint)
  WHERE is_default = TRUE;

ALTER TABLE public.client_saved_payment_methods ENABLE ROW LEVEL SECURITY;

-- Sem políticas para anon/authenticated: acesso exclusivo via Edge Functions
-- usando service role, que sempre validam a sessão e o vínculo client/user.
REVOKE ALL ON TABLE public.client_saved_payment_methods FROM anon, authenticated;
GRANT ALL ON TABLE public.client_saved_payment_methods TO service_role;

COMMENT ON TABLE public.client_saved_payment_methods IS
  'Carteira Zailom: tokens específicos de gateway e metadados mascarados; nunca armazenar PAN/CVV.';
COMMENT ON COLUMN public.client_saved_payment_methods.provider_token IS
  'Token de pagamento emitido pelo gateway; nunca devolver ao frontend.';
COMMENT ON COLUMN public.client_saved_payment_methods.gateway_account_fingerprint IS
  'SHA-256 de provedor + chave da conta, sem armazenar/expor a chave original.';
