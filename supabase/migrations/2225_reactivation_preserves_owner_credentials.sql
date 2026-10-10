-- 2223: empresas que já têm senha empresarial são reativadas sem novo onboarding.
-- Não altera employees.password_hash nem exige que o proprietário cadastre senha novamente.
CREATE OR REPLACE FUNCTION public.mark_subscription_invoice_paid_v2(
  _asaas_payment_id text,
  _invoice_id uuid,
  _paid_at timestamptz DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_invoice record;
  v_requires_activation boolean := false;
BEGIN
  SELECT * INTO v_invoice FROM public.company_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'invoice_not_found'); END IF;
  v_company_id := v_invoice.company_id;

  UPDATE public.company_invoices
    SET status = 'paid', paid_at = _paid_at,
        asaas_payment_id = COALESCE(asaas_payment_id, _asaas_payment_id),
        updated_at = now()
    WHERE id = _invoice_id;

  IF v_invoice.kind = 'subscription' THEN
    UPDATE public.company_invoices
      SET status = 'cancelled', updated_at = now()
      WHERE company_id = v_company_id AND status = 'pending'
        AND kind = 'subscription' AND id != _invoice_id AND due_date = v_invoice.due_date;
  END IF;

  -- O onboarding só é exigido quando a credencial empresarial ainda não existe.
  -- Uma empresa que já tinha senha mantém essa mesma senha ao regularizar a cobrança.
  SELECT EXISTS (
    SELECT 1
      FROM public.owner_company_confirmations occ
      JOIN public.employees e ON e.id = occ.employee_id AND e.company_id = occ.company_id
     WHERE occ.company_id = v_company_id
       AND occ.confirmed_at IS NULL
       AND NULLIF(e.password_hash, '') IS NULL
  ) INTO v_requires_activation;

  IF v_requires_activation THEN
    UPDATE public.company_subscriptions
      SET billing_status = 'active', status = 'pending', updated_at = now()
      WHERE company_id = v_company_id;
    UPDATE public.companies SET status = 'pending_payment' WHERE id = v_company_id;
  ELSE
    UPDATE public.company_subscriptions
      SET billing_status = 'active', status = 'active', updated_at = now()
      WHERE company_id = v_company_id;
    UPDATE public.companies SET status = 'active' WHERE id = v_company_id;
    UPDATE public.employees e
       SET is_active = true
      FROM public.owner_company_confirmations occ
     WHERE occ.company_id = v_company_id
       AND occ.employee_id = e.id
       AND e.company_id = v_company_id
       AND NULLIF(e.password_hash, '') IS NOT NULL;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'company_id', v_company_id,
    'activation_pending', v_requires_activation,
    'credentials_preserved', NOT v_requires_activation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_subscription_invoice_paid_v2(text, uuid, timestamptz) TO service_role;
NOTIFY pgrst, 'reload schema';
