-- FASE 10.6 — RLS de horários baseada no catálogo de permissões.
-- employee_permissions é a fonte de verdade.
-- Leitura: qualquer permissão de visualização de horários.
-- Escrita: hr.manage_attendance (owner/admin também passam pelo helper).

ALTER TABLE IF EXISTS public.schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedule_cycles_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedule_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tpl_tenant_all" ON public.schedule_templates;
DROP POLICY IF EXISTS "schedule_templates_permission_select" ON public.schedule_templates;
DROP POLICY IF EXISTS "schedule_templates_permission_insert" ON public.schedule_templates;
DROP POLICY IF EXISTS "schedule_templates_permission_update" ON public.schedule_templates;
DROP POLICY IF EXISTS "schedule_templates_permission_delete" ON public.schedule_templates;

CREATE POLICY "schedule_templates_permission_select" ON public.schedule_templates
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(tenant_id, 'schedules.view_establishment')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_fixed')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_autonomous')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_absences')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_blocks')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_shifts')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_breaks')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_rules')
);

CREATE POLICY "schedule_templates_permission_insert" ON public.schedule_templates
FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'));

CREATE POLICY "schedule_templates_permission_update" ON public.schedule_templates
FOR UPDATE TO authenticated
USING (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'))
WITH CHECK (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'));

CREATE POLICY "schedule_templates_permission_delete" ON public.schedule_templates
FOR DELETE TO authenticated
USING (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'));

DROP POLICY IF EXISTS "cycle_tenant_all" ON public.schedule_cycles_config;
DROP POLICY IF EXISTS "schedule_cycles_permission_select" ON public.schedule_cycles_config;
DROP POLICY IF EXISTS "schedule_cycles_permission_write" ON public.schedule_cycles_config;

CREATE POLICY "schedule_cycles_permission_select" ON public.schedule_cycles_config
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(tenant_id, 'schedules.view_establishment')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_rules')
  OR public.user_has_company_permission(tenant_id, 'hr.manage_attendance')
);

CREATE POLICY "schedule_cycles_permission_write" ON public.schedule_cycles_config
FOR ALL TO authenticated
USING (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'))
WITH CHECK (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'));

DROP POLICY IF EXISTS "sch_tenant_all" ON public.schedules;
DROP POLICY IF EXISTS "sched_read" ON public.schedules;
DROP POLICY IF EXISTS "sched_insert" ON public.schedules;
DROP POLICY IF EXISTS "sched_update" ON public.schedules;
DROP POLICY IF EXISTS "sched_delete" ON public.schedules;

CREATE POLICY "schedules_permission_select" ON public.schedules
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(tenant_id, 'schedules.view_establishment')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_fixed')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_autonomous')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_absences')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_blocks')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_shifts')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_breaks')
  OR public.user_has_company_permission(tenant_id, 'schedules.view_rules')
);

CREATE POLICY "schedules_permission_insert" ON public.schedules
FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'));

CREATE POLICY "schedules_permission_update" ON public.schedules
FOR UPDATE TO authenticated
USING (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'))
WITH CHECK (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'));

CREATE POLICY "schedules_permission_delete" ON public.schedules
FOR DELETE TO authenticated
USING (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'));

DROP POLICY IF EXISTS "sch_entries_tenant_all" ON public.schedule_entries;
DROP POLICY IF EXISTS "schedule_entries_permission_select" ON public.schedule_entries;
DROP POLICY IF EXISTS "schedule_entries_permission_insert" ON public.schedule_entries;
DROP POLICY IF EXISTS "schedule_entries_permission_update" ON public.schedule_entries;
DROP POLICY IF EXISTS "schedule_entries_permission_delete" ON public.schedule_entries;

CREATE POLICY "schedule_entries_permission_select" ON public.schedule_entries
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.id = schedule_entries.schedule_id
      AND (
        public.user_has_company_permission(s.tenant_id, 'schedules.view_establishment')
        OR public.user_has_company_permission(s.tenant_id, 'schedules.view_fixed')
        OR public.user_has_company_permission(s.tenant_id, 'schedules.view_autonomous')
        OR public.user_has_company_permission(s.tenant_id, 'schedules.view_absences')
        OR public.user_has_company_permission(s.tenant_id, 'schedules.view_blocks')
        OR public.user_has_company_permission(s.tenant_id, 'schedules.view_shifts')
        OR public.user_has_company_permission(s.tenant_id, 'schedules.view_breaks')
        OR public.user_has_company_permission(s.tenant_id, 'schedules.view_rules')
      )
  )
);

CREATE POLICY "schedule_entries_permission_insert" ON public.schedule_entries
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.id = schedule_entries.schedule_id
      AND public.user_has_company_permission(s.tenant_id, 'hr.manage_attendance')
  )
);

CREATE POLICY "schedule_entries_permission_update" ON public.schedule_entries
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_entries.schedule_id
    AND public.user_has_company_permission(s.tenant_id, 'hr.manage_attendance'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_entries.schedule_id
    AND public.user_has_company_permission(s.tenant_id, 'hr.manage_attendance'))
);

CREATE POLICY "schedule_entries_permission_delete" ON public.schedule_entries
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_entries.schedule_id
    AND public.user_has_company_permission(s.tenant_id, 'hr.manage_attendance'))
);

DROP POLICY IF EXISTS "audit_read_company" ON public.schedule_audit_log;
DROP POLICY IF EXISTS "audit_insert_company" ON public.schedule_audit_log;
DROP POLICY IF EXISTS "schedule_audit_permission_select" ON public.schedule_audit_log;
DROP POLICY IF EXISTS "schedule_audit_permission_insert" ON public.schedule_audit_log;

CREATE POLICY "schedule_audit_permission_select" ON public.schedule_audit_log
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(tenant_id, 'schedules.view_rules')
  OR public.user_has_company_permission(tenant_id, 'hr.manage_attendance')
);

CREATE POLICY "schedule_audit_permission_insert" ON public.schedule_audit_log
FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(tenant_id, 'hr.manage_attendance'));

NOTIFY pgrst, 'reload schema';
