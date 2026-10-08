-- 2218: mantém onboarding pendente até senha criada e controla e-mail de ativação.
ALTER TABLE public.owner_company_confirmations
  ADD COLUMN IF NOT EXISTS password_setup_email_sent_at TIMESTAMPTZ;

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
  SELECT * INTO v_invoice FROM public.company_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'invoice_not_found'); END IF;
  v_company_id := v_invoice.company_id;

  UPDATE public.company_invoices
    SET status = 'paid', paid_at = _paid_at,
        asaas_payment_id = COALESCE(asaas_payment_id, _asaas_payment_id)
    WHERE id = _invoice_id;

  IF v_invoice.kind = 'subscription' THEN
    UPDATE public.company_invoices
      SET status = 'cancelled', updated_at = now()
      WHERE company_id = v_company_id AND status = 'pending'
        AND kind = 'subscription' AND id != _invoice_id AND due_date = v_invoice.due_date;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.owner_company_confirmations occ
    WHERE occ.company_id = v_company_id AND occ.confirmed_at IS NULL
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
  END IF;

  RETURN json_build_object('ok', true, 'company_id', v_company_id, 'activation_pending', v_requires_activation);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_subscription_invoice_paid_v2(text, uuid, timestamptz) TO service_role;
NOTIFY pgrst, 'reload schema';
