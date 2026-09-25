-- FASE 10.8 — RLS Financeiro / cobrança.
-- Tabelas opcionais são tratadas dinamicamente para não quebrar bases antigas.
-- Assinatura e faturas da própria empresa usam subscription.*;
-- pagamentos/payouts operacionais usam finance.*.

DO $$
DECLARE
  t text;
  company_col text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_invoices',
    'company_payment_methods',
    'company_payment_tokens'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    SELECT column_name INTO company_col
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=t
      AND column_name IN ('company_id','tenant_id')
    ORDER BY CASE column_name WHEN 'company_id' THEN 0 ELSE 1 END
    LIMIT 1;

    IF company_col IS NULL THEN CONTINUE; END IF;

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND (roles::text ILIKE '%authenticated%'
             OR roles::text ILIKE '%public%')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF t = 'company_invoices' OR t = 'company_payment_methods' OR t = 'company_payment_tokens' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
           public.user_has_company_permission(%I, ''subscription.view'')
           OR public.user_has_company_permission(%I, ''subscription.manage'')
           OR public.user_has_company_permission(%I, ''finance.view'')
           OR public.user_has_company_permission(%I, ''finance.manage'')
         )',
        t || '_permission_select', t, company_col, company_col, company_col, company_col
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
           public.user_has_company_permission(%I, ''subscription.manage'')
           OR public.user_has_company_permission(%I, ''finance.manage'')
         )',
        t || '_permission_insert', t, company_col, company_col
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.user_has_company_permission(%I, ''subscription.manage'')
             OR public.user_has_company_permission(%I, ''finance.manage''))
         WITH CHECK (public.user_has_company_permission(%I, ''subscription.manage'')
             OR public.user_has_company_permission(%I, ''finance.manage''))',
        t || '_permission_update', t, company_col, company_col, company_col, company_col
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
           public.user_has_company_permission(%I, ''subscription.manage'')
           OR public.user_has_company_permission(%I, ''finance.manage'')
         )',
        t || '_permission_delete', t, company_col, company_col
      );
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'autonomous_payouts',
    'payment_adjustments',
    'booking_payments'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    SELECT column_name INTO company_col
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=t
      AND column_name IN ('company_id','tenant_id')
    ORDER BY CASE column_name WHEN 'company_id' THEN 0 ELSE 1 END
    LIMIT 1;

    IF company_col IS NULL THEN CONTINUE; END IF;

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND roles::text ILIKE '%authenticated%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
         public.user_has_company_permission(%I, ''finance.view'')
         OR public.user_has_company_permission(%I, ''finance.manage'')
       )',
      t || '_finance_select', t, company_col, company_col
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
         public.user_has_company_permission(%I, ''finance.manage'')
       )',
      t || '_finance_insert', t, company_col
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (public.user_has_company_permission(%I, ''finance.manage''))
       WITH CHECK (public.user_has_company_permission(%I, ''finance.manage''))',
      t || '_finance_update', t, company_col, company_col
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
         public.user_has_company_permission(%I, ''finance.manage'')
       )',
      t || '_finance_delete', t, company_col
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
