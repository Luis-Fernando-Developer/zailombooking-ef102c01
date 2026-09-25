-- FASE 10.9 — RLS de Configurações.
-- Landing Page tem permissão granular própria; demais configurações usam settings.*.

DO $$
DECLARE
  p record;
BEGIN
  IF to_regclass('public.company_customizations') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='company_customizations'
        AND roles::text ILIKE '%authenticated%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_customizations', p.policyname);
    END LOOP;

    ALTER TABLE public.company_customizations ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "company_customizations_permission_select"
      ON public.company_customizations FOR SELECT TO authenticated
      USING (
        public.user_has_company_permission(company_id, 'settings.view')
        OR public.user_has_company_permission(company_id, 'settings.view_landing_page')
        OR public.user_has_company_permission(company_id, 'settings.manage')
      );

    CREATE POLICY "company_customizations_permission_insert"
      ON public.company_customizations FOR INSERT TO authenticated
      WITH CHECK (
        public.user_has_company_permission(company_id, 'settings.view_landing_page')
        OR public.user_has_company_permission(company_id, 'settings.manage')
      );

    CREATE POLICY "company_customizations_permission_update"
      ON public.company_customizations FOR UPDATE TO authenticated
      USING (
        public.user_has_company_permission(company_id, 'settings.view_landing_page')
        OR public.user_has_company_permission(company_id, 'settings.manage')
      )
      WITH CHECK (
        public.user_has_company_permission(company_id, 'settings.view_landing_page')
        OR public.user_has_company_permission(company_id, 'settings.manage')
      );

    CREATE POLICY "company_customizations_permission_delete"
      ON public.company_customizations FOR DELETE TO authenticated
      USING (public.user_has_company_permission(company_id, 'settings.manage'));
  END IF;

  IF to_regclass('public.chatbot_integration') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='chatbot_integration'
        AND roles::text ILIKE '%authenticated%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.chatbot_integration', p.policyname);
    END LOOP;

    ALTER TABLE public.chatbot_integration ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "chatbot_integration_permission_select"
      ON public.chatbot_integration FOR SELECT TO authenticated
      USING (
        public.user_has_company_permission(company_id, 'settings.view')
        OR public.user_has_company_permission(company_id, 'chatbot.view')
        OR public.user_has_company_permission(company_id, 'chatbot.manage')
      );

    CREATE POLICY "chatbot_integration_permission_manage"
      ON public.chatbot_integration FOR ALL TO authenticated
      USING (
        public.user_has_company_permission(company_id, 'chatbot.manage')
        OR public.user_has_company_permission(company_id, 'settings.manage')
      )
      WITH CHECK (
        public.user_has_company_permission(company_id, 'chatbot.manage')
        OR public.user_has_company_permission(company_id, 'settings.manage')
      );
  END IF;

  IF to_regclass('public.api_keys') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='api_keys'
        AND roles::text ILIKE '%authenticated%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.api_keys', p.policyname);
    END LOOP;

    ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "api_keys_permission_select"
      ON public.api_keys FOR SELECT TO authenticated
      USING (
        public.user_has_company_permission(company_id, 'settings.view')
        OR public.user_has_company_permission(company_id, 'settings.manage')
      );

    CREATE POLICY "api_keys_permission_manage"
      ON public.api_keys FOR ALL TO authenticated
      USING (public.user_has_company_permission(company_id, 'settings.manage'))
      WITH CHECK (public.user_has_company_permission(company_id, 'settings.manage'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
