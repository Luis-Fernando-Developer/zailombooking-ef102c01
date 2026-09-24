-- FASE 10.18 — Landing Page: visualização e edição são independentes,
-- mas edição exige as duas permissões.
DO $$
BEGIN
  IF to_regclass('public.company_customizations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "company_customizations_permission_insert" ON public.company_customizations;
    DROP POLICY IF EXISTS "company_customizations_permission_update" ON public.company_customizations;
    DROP POLICY IF EXISTS "company_customizations_permission_delete" ON public.company_customizations;

    CREATE POLICY "company_customizations_permission_insert"
      ON public.company_customizations FOR INSERT TO authenticated
      WITH CHECK (
        public.user_has_company_permission(company_id, 'settings.view_landing_page')
        AND public.user_has_company_permission(company_id, 'settings.manage')
      );

    CREATE POLICY "company_customizations_permission_update"
      ON public.company_customizations FOR UPDATE TO authenticated
      USING (
        public.user_has_company_permission(company_id, 'settings.view_landing_page')
        AND public.user_has_company_permission(company_id, 'settings.manage')
      )
      WITH CHECK (
        public.user_has_company_permission(company_id, 'settings.view_landing_page')
        AND public.user_has_company_permission(company_id, 'settings.manage')
      );

    CREATE POLICY "company_customizations_permission_delete"
      ON public.company_customizations FOR DELETE TO authenticated
      USING (
        public.user_has_company_permission(company_id, 'settings.view_landing_page')
        AND public.user_has_company_permission(company_id, 'settings.manage')
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
