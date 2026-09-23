-- FASE 10.11 — RLS de Solicitações e RH.
-- Solicitações próprias continuam permitidas; aprovação/gestão exige a permissão
-- específica correspondente.

ALTER TABLE IF EXISTS public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.request_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.request_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.request_approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests_tenant_read" ON public.requests;
DROP POLICY IF EXISTS "requests_tenant_insert" ON public.requests;
DROP POLICY IF EXISTS "requests_tenant_update" ON public.requests;
DROP POLICY IF EXISTS "requests_permission_select" ON public.requests;
DROP POLICY IF EXISTS "requests_permission_insert" ON public.requests;
DROP POLICY IF EXISTS "requests_permission_update_own" ON public.requests;
DROP POLICY IF EXISTS "requests_permission_manage" ON public.requests;

CREATE POLICY "requests_permission_select" ON public.requests
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.user_has_company_permission(tenant_id, 'hr.view')
  OR (request_type = 'absence_request' AND public.user_has_company_permission(tenant_id, 'hr.manage_absences'))
  OR (request_type IN ('schedule_change','overtime_request') AND public.user_has_company_permission(tenant_id, 'hr.manage_attendance'))
);

CREATE POLICY "requests_permission_insert" ON public.requests
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.user_is_company_member(tenant_id)
);

CREATE POLICY "requests_permission_update_own" ON public.requests
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  AND status IN ('draft','pending','in_review')
)
WITH CHECK (
  created_by = auth.uid()
  AND status IN ('draft','pending','in_review')
);

CREATE POLICY "requests_permission_manage" ON public.requests
FOR UPDATE TO authenticated
USING (
  public.user_has_company_permission(tenant_id, 'hr.view')
  OR (request_type = 'absence_request' AND public.user_has_company_permission(tenant_id, 'hr.manage_absences'))
  OR (request_type IN ('schedule_change','overtime_request') AND public.user_has_company_permission(tenant_id, 'hr.manage_attendance'))
)
WITH CHECK (
  public.user_has_company_permission(tenant_id, 'hr.view')
  OR (request_type = 'absence_request' AND public.user_has_company_permission(tenant_id, 'hr.manage_absences'))
  OR (request_type IN ('schedule_change','overtime_request') AND public.user_has_company_permission(tenant_id, 'hr.manage_attendance'))
);

DROP POLICY IF EXISTS "comments_tenant_read" ON public.request_comments;
DROP POLICY IF EXISTS "comments_tenant_insert" ON public.request_comments;
DROP POLICY IF EXISTS "request_comments_permission_select" ON public.request_comments;
DROP POLICY IF EXISTS "request_comments_permission_insert" ON public.request_comments;

CREATE POLICY "request_comments_permission_select" ON public.request_comments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_id
      AND (
        r.created_by = auth.uid()
        OR public.user_has_company_permission(r.tenant_id, 'hr.view')
        OR (r.request_type = 'absence_request' AND public.user_has_company_permission(r.tenant_id, 'hr.manage_absences'))
        OR (r.request_type IN ('schedule_change','overtime_request') AND public.user_has_company_permission(r.tenant_id, 'hr.manage_attendance'))
      )
  )
);

CREATE POLICY "request_comments_permission_insert" ON public.request_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_id AND public.user_is_company_member(r.tenant_id)
  )
);

DROP POLICY IF EXISTS "audit_tenant_read" ON public.request_audit_log;
DROP POLICY IF EXISTS "request_audit_permission_select" ON public.request_audit_log;
CREATE POLICY "request_audit_permission_select" ON public.request_audit_log
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(tenant_id, 'hr.view')
  OR public.user_has_company_permission(tenant_id, 'hr.view_reports')
);

DROP POLICY IF EXISTS "rules_tenant_read" ON public.request_approval_rules;
DROP POLICY IF EXISTS "rules_tenant_write" ON public.request_approval_rules;
DROP POLICY IF EXISTS "request_rules_permission_select" ON public.request_approval_rules;
DROP POLICY IF EXISTS "request_rules_permission_manage" ON public.request_approval_rules;

CREATE POLICY "request_rules_permission_select" ON public.request_approval_rules
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(tenant_id, 'hr.view')
  OR public.user_has_company_permission(tenant_id, 'hr.manage_absences')
  OR public.user_has_company_permission(tenant_id, 'hr.manage_attendance')
);

CREATE POLICY "request_rules_permission_manage" ON public.request_approval_rules
FOR ALL TO authenticated
USING (
  public.user_has_company_permission(tenant_id, 'hr.manage_absences')
  OR public.user_has_company_permission(tenant_id, 'hr.manage_attendance')
)
WITH CHECK (
  public.user_has_company_permission(tenant_id, 'hr.manage_absences')
  OR public.user_has_company_permission(tenant_id, 'hr.manage_attendance')
);

DROP POLICY IF EXISTS employee_documents_tenant_all ON public.employee_documents;
DROP POLICY IF EXISTS employee_documents_permission_select ON public.employee_documents;
DROP POLICY IF EXISTS employee_documents_permission_manage ON public.employee_documents;
CREATE POLICY employee_documents_permission_select ON public.employee_documents
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id, 'hr.view')
  OR public.user_has_company_permission(company_id, 'hr.manage_documents')
);
CREATE POLICY employee_documents_permission_manage ON public.employee_documents
FOR ALL TO authenticated
USING (public.user_has_company_permission(company_id, 'hr.manage_documents'))
WITH CHECK (public.user_has_company_permission(company_id, 'hr.manage_documents'));

DROP POLICY IF EXISTS employee_evaluations_tenant_all ON public.employee_evaluations;
DROP POLICY IF EXISTS employee_evaluations_permission_select ON public.employee_evaluations;
DROP POLICY IF EXISTS employee_evaluations_permission_manage ON public.employee_evaluations;
CREATE POLICY employee_evaluations_permission_select ON public.employee_evaluations
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id, 'hr.view')
  OR public.user_has_company_permission(company_id, 'hr.manage_evaluations')
);
CREATE POLICY employee_evaluations_permission_manage ON public.employee_evaluations
FOR ALL TO authenticated
USING (public.user_has_company_permission(company_id, 'hr.manage_evaluations'))
WITH CHECK (public.user_has_company_permission(company_id, 'hr.manage_evaluations'));

DROP POLICY IF EXISTS employee_history_tenant_select ON public.employee_history;
DROP POLICY IF EXISTS employee_history_permission_select ON public.employee_history;
CREATE POLICY employee_history_permission_select ON public.employee_history
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id, 'hr.view')
  OR public.user_has_company_permission(company_id, 'hr.view_reports')
);

DROP POLICY IF EXISTS employee_absences_permission_select ON public.employee_absences;
DROP POLICY IF EXISTS employee_absences_permission_manage ON public.employee_absences;
CREATE POLICY employee_absences_permission_select ON public.employee_absences
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id, 'hr.view')
  OR public.user_has_company_permission(company_id, 'hr.manage_absences')
);

CREATE POLICY employee_absences_permission_manage ON public.employee_absences
FOR ALL TO authenticated
USING (public.user_has_company_permission(company_id, 'hr.manage_absences'))
WITH CHECK (public.user_has_company_permission(company_id, 'hr.manage_absences'));

NOTIFY pgrst, 'reload schema';
