-- 1. Melhoria na receita real no Super Admin
-- Criar uma view ou função para calcular receita real de assinaturas pagas
CREATE OR REPLACE FUNCTION public.get_company_total_revenue(p_company_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.company_invoices
  WHERE company_id = p_company_id AND status = 'paid';
$$;

-- 2. Toggles no painel super admin para empresas
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS manual_resource_release_until timestamptz,
ADD COLUMN IF NOT EXISTS force_early_renewal_once boolean DEFAULT false;

-- 3. Correção de faturas duplicadas e status de suspensão
-- Função para marcar fatura como paga e limpar pendências de antecipação
CREATE OR REPLACE FUNCTION public.mark_subscription_invoice_paid_v2(_asaas_payment_id text, _invoice_id uuid, _paid_at timestamptz DEFAULT now())
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_invoice record;
BEGIN
  SELECT * INTO v_invoice FROM public.company_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'invoice_not_found'); END IF;
  
  v_company_id := v_invoice.company_id;
  
  -- Atualiza fatura
  UPDATE public.company_invoices 
  SET status = 'paid', paid_at = _paid_at, asaas_payment_id = COALESCE(asaas_payment_id, _asaas_payment_id)
  WHERE id = _invoice_id;
  
  -- Se for antecipação, remove outras faturas pendentes do mesmo ciclo para evitar triplicatas
  IF v_invoice.kind = 'subscription' THEN
    UPDATE public.company_invoices
    SET status = 'cancelled', updated_at = now()
    WHERE company_id = v_company_id 
      AND status = 'pending' 
      AND kind = 'subscription' 
      AND id != _invoice_id
      AND due_date = v_invoice.due_date;
  END IF;

  -- Reativa assinatura
  UPDATE public.company_subscriptions
  SET billing_status = 'active', status = 'active', updated_at = now()
  WHERE company_id = v_company_id;

  -- Reativa empresa
  UPDATE public.companies SET status = 'active' WHERE id = v_company_id;

  RETURN json_build_object('ok', true, 'company_id', v_company_id);
END;
$$;

-- 4. Configuração de Checkout Personalizável Provedor
ALTER TABLE public.company_payment_settings 
ADD COLUMN IF NOT EXISTS use_provider_checkout boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS provider_checkout_config jsonb DEFAULT '{}'::jsonb;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.get_company_total_revenue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_total_revenue(uuid) TO service_role;
