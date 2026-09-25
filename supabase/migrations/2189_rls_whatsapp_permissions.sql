-- FASE 10.10 — RLS WhatsApp.

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'whatsapp_integration',
    'whatsapp_instances',
    'whatsapp_templates',
    'whatsapp_message_usage'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND roles::text ILIKE '%authenticated%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;

    ALTER TABLE public.whatsapp_integration ENABLE ROW LEVEL SECURITY;
    IF t = 'whatsapp_instances' THEN ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY; END IF;
    IF t = 'whatsapp_templates' THEN ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY; END IF;
    IF t = 'whatsapp_message_usage' THEN ALTER TABLE public.whatsapp_message_usage ENABLE ROW LEVEL SECURITY; END IF;

    IF t = 'whatsapp_message_usage' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
           public.user_has_company_permission(company_id, ''whatsapp.view'')
           OR public.user_has_company_permission(company_id, ''whatsapp.manage'')
         )',
        t || '_permission_select', t
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
           public.user_has_company_permission(company_id, ''whatsapp.view'')
           OR public.user_has_company_permission(company_id, ''whatsapp.manage'')
         )',
        t || '_permission_select', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
           public.user_has_company_permission(company_id, ''whatsapp.manage'')
         )',
        t || '_permission_insert', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.user_has_company_permission(company_id, ''whatsapp.manage''))
         WITH CHECK (public.user_has_company_permission(company_id, ''whatsapp.manage''))',
        t || '_permission_update', t, t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
           public.user_has_company_permission(company_id, ''whatsapp.manage'')
         )',
        t || '_permission_delete', t
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
