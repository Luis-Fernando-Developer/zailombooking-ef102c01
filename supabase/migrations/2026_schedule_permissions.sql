-- ============================================================================
-- 2026_schedule_permissions.sql
-- Hierarquia de perfis + Permissões/Aprovação/Auditoria de Escalas
-- + Notificações direcionadas (target_user_id em company_notifications)
--
-- Rodar manualmente no SQL Editor. Idempotente.
-- Depende de: 2026_org_structure.sql, 2026_escalas.sql, 2026_company_notifications.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) HIERARQUIA + FLAGS em system_profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.system_profiles
  ADD COLUMN IF NOT EXISTS hierarchy_level     INT     NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS can_create_schedule BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_approve_schedule BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_be_scheduled    BOOLEAN NOT NULL DEFAULT true;

-- Seed/atualização dos perfis padrão (menor level = mais autoridade)
UPDATE public.system_profiles SET hierarchy_level = 10, can_create_schedule = true,  can_approve_schedule = true,  can_be_scheduled = true  WHERE code = 'OWNER';
UPDATE public.system_profiles SET hierarchy_level = 20, can_create_schedule = true,  can_approve_schedule = true,  can_be_scheduled = true  WHERE code = 'GERENTE';
UPDATE public.system_profiles SET hierarchy_level = 30, can_create_schedule = true,  can_approve_schedule = true,  can_be_scheduled = true  WHERE code = 'RH';
UPDATE public.system_profiles SET hierarchy_level = 40, can_create_schedule = false, can_approve_schedule = false, can_be_scheduled = true  WHERE code = 'FINANCEIRO';
UPDATE public.system_profiles SET hierarchy_level = 40, can_create_schedule = false, can_approve_schedule = false, can_be_scheduled = true  WHERE code = 'MARKETING';
UPDATE public.system_profiles SET hierarchy_level = 50, can_create_schedule = true,  can_approve_schedule = false, can_be_scheduled = true  WHERE code = 'ENCARREGADO';
UPDATE public.system_profiles SET hierarchy_level = 60, can_create_schedule = false, can_approve_schedule = false, can_be_scheduled = true  WHERE code = 'RECEPCIONISTA';
UPDATE public.system_profiles SET hierarchy_level = 70, can_create_schedule = false, can_approve_schedule = false, can_be_scheduled = true  WHERE code = 'PROFISSIONAL';
UPDATE public.system_profiles SET hierarchy_level = 80, can_create_schedule = false, can_approve_schedule = false, can_be_scheduled = true  WHERE code IN ('FAXINEIRO','SEGURANCA','FISCAL','DESIGNER_GRAFICO');

CREATE INDEX IF NOT EXISTS idx_system_profiles_level ON public.system_profiles(hierarchy_level);

-- ---------------------------------------------------------------------------
-- 2) ENUM schedule_status += 'revision_requested'
-- ---------------------------------------------------------------------------
ALTER TYPE public.schedule_status ADD VALUE IF NOT EXISTS 'revision_requested';

-- ---------------------------------------------------------------------------
-- 3) COLUNAS de aprovação em schedules
-- ---------------------------------------------------------------------------
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS approved_by             UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by             UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason        TEXT,
  ADD COLUMN IF NOT EXISTS revision_requested_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revision_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_reason         TEXT,
  ADD COLUMN IF NOT EXISTS submitted_to_user_ids   UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS submitted_to_levels     BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4) AUDIT LOG de escalas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('created','edited','submitted','approved','rejected','revision_requested','auto_approved')),
  actor_user_id   UUID REFERENCES auth.users(id),
  reason          TEXT,
  snapshot        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sched_audit_schedule ON public.schedule_audit_log(schedule_id, created_at DESC);

GRANT SELECT, INSERT ON public.schedule_audit_log TO authenticated;
GRANT ALL ON public.schedule_audit_log TO service_role;

ALTER TABLE public.schedule_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_read_company" ON public.schedule_audit_log;
CREATE POLICY "audit_read_company" ON public.schedule_audit_log
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "audit_insert_company" ON public.schedule_audit_log;
CREATE POLICY "audit_insert_company" ON public.schedule_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), tenant_id));

-- ---------------------------------------------------------------------------
-- 5) NOTIFICAÇÕES DIRECIONADAS — target_user_id em company_notifications
--    NULL = visível a toda empresa (comportamento atual)
--    != NULL = visível apenas àquele user
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_notifications
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_company_notif_target
  ON public.company_notifications(target_user_id, is_read, created_at DESC);

DROP POLICY IF EXISTS "company members read notifs" ON public.company_notifications;
CREATE POLICY "company members read notifs"
  ON public.company_notifications FOR SELECT
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (target_user_id IS NULL OR target_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 6) FUNÇÕES DE HIERARQUIA / PERMISSÃO
-- ---------------------------------------------------------------------------

-- Nível de um user em uma empresa. Owner por owner_email = 0. Sem perfil = 999.
CREATE OR REPLACE FUNCTION public.user_schedule_level(_user_id UUID, _company_id UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_level INT;
  v_is_owner BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    JOIN auth.users u ON lower(u.email) = lower(c.owner_email)
    WHERE c.id = _company_id AND u.id = _user_id
  ) INTO v_is_owner;
  IF v_is_owner THEN RETURN 0; END IF;

  SELECT sp.hierarchy_level
    INTO v_level
    FROM public.employees e
    JOIN public.system_profiles sp ON sp.id = e.system_profile_id
   WHERE e.user_id = _user_id AND e.company_id = _company_id
   LIMIT 1;

  RETURN COALESCE(v_level, 999);
END $$;

-- Pode criar escala?
CREATE OR REPLACE FUNCTION public.user_can_create_schedule(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.user_schedule_level(_user_id, _company_id) = 0
    OR EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.system_profiles sp ON sp.id = e.system_profile_id
      WHERE e.user_id = _user_id AND e.company_id = _company_id
        AND sp.can_create_schedule = true
    );
$$;

-- Pode aprovar uma escala específica?
CREATE OR REPLACE FUNCTION public.user_can_approve_schedule(_user_id UUID, _schedule_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_creator UUID;
  v_user_level INT;
  v_creator_level INT;
  v_user_can BOOLEAN;
BEGIN
  SELECT tenant_id, created_by INTO v_tenant, v_creator
    FROM public.schedules WHERE id = _schedule_id;
  IF v_tenant IS NULL THEN RETURN false; END IF;

  -- Owner aprova tudo (menos a si mesmo, mas owner auto-aprova na criação)
  IF public.user_schedule_level(_user_id, v_tenant) = 0 THEN
    RETURN _user_id <> v_creator;
  END IF;

  -- Segregação: criador não pode aprovar
  IF _user_id = v_creator THEN RETURN false; END IF;

  -- Perfil precisa ter can_approve_schedule
  SELECT sp.can_approve_schedule
    INTO v_user_can
    FROM public.employees e
    JOIN public.system_profiles sp ON sp.id = e.system_profile_id
   WHERE e.user_id = _user_id AND e.company_id = v_tenant
   LIMIT 1;
  IF NOT COALESCE(v_user_can, false) THEN RETURN false; END IF;

  v_user_level := public.user_schedule_level(_user_id, v_tenant);
  v_creator_level := public.user_schedule_level(v_creator, v_tenant);

  -- Aprovador deve estar estritamente ACIMA do criador
  RETURN v_user_level < v_creator_level;
END $$;

-- Pode escalar (alvo) um colaborador específico?
CREATE OR REPLACE FUNCTION public.user_can_schedule_employee(_creator UUID, _employee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_target_user UUID;
  v_creator_level INT;
  v_target_level INT;
BEGIN
  SELECT company_id, user_id INTO v_company, v_target_user
    FROM public.employees WHERE id = _employee_id;
  IF v_company IS NULL THEN RETURN false; END IF;

  v_creator_level := public.user_schedule_level(_creator, v_company);

  -- Owner enxerga todos
  IF v_creator_level = 0 THEN RETURN true; END IF;

  -- Não pode escalar a si mesmo (criador != alvo user)
  IF v_target_user IS NOT NULL AND v_target_user = _creator THEN RETURN false; END IF;

  -- Alvo deve estar abaixo (level maior). Sem user vinculado -> usa level do perfil.
  SELECT COALESCE(sp.hierarchy_level, 999)
    INTO v_target_level
    FROM public.employees e
    LEFT JOIN public.system_profiles sp ON sp.id = e.system_profile_id
   WHERE e.id = _employee_id;

  RETURN v_target_level > v_creator_level;
END $$;

-- ---------------------------------------------------------------------------
-- 7) RLS de schedules — substitui policy genérica
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sched_tenant_all" ON public.schedules;

DROP POLICY IF EXISTS "sched_read"   ON public.schedules;
DROP POLICY IF EXISTS "sched_insert" ON public.schedules;
DROP POLICY IF EXISTS "sched_update" ON public.schedules;
DROP POLICY IF EXISTS "sched_delete" ON public.schedules;

CREATE POLICY "sched_read" ON public.schedules
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id));

CREATE POLICY "sched_insert" ON public.schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), tenant_id)
    AND public.user_can_create_schedule(auth.uid(), tenant_id)
  );

CREATE POLICY "sched_update" ON public.schedules
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), tenant_id));

CREATE POLICY "sched_delete" ON public.schedules
  FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), tenant_id)
    AND (created_by = auth.uid() OR public.user_schedule_level(auth.uid(), tenant_id) = 0)
  );

-- ---------------------------------------------------------------------------
-- 8) AUTO-APROVAÇÃO — Owner aprova automaticamente o que criou
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedules_auto_approve()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('draft','pending_approval')
     AND public.user_schedule_level(NEW.created_by, NEW.tenant_id) = 0 THEN
    NEW.status := 'approved';
    NEW.approved_by := COALESCE(NEW.approved_by, NEW.created_by);
    NEW.approved_at := COALESCE(NEW.approved_at, NOW());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_schedules_auto_approve ON public.schedules;
CREATE TRIGGER trg_schedules_auto_approve
  BEFORE INSERT OR UPDATE OF status ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.schedules_auto_approve();

-- ---------------------------------------------------------------------------
-- 9) RPC auxiliares para o frontend
-- ---------------------------------------------------------------------------

-- Lista colaboradores que o usuário atual pode escalar (alvos abaixo)
CREATE OR REPLACE FUNCTION public.list_schedulable_employees(_company_id UUID)
RETURNS TABLE (id UUID, name TEXT, profile_code TEXT, profile_name TEXT, level INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.name, sp.code, sp.name, COALESCE(sp.hierarchy_level, 999)
    FROM public.employees e
    LEFT JOIN public.system_profiles sp ON sp.id = e.system_profile_id
   WHERE e.company_id = _company_id
     AND e.is_active = true
     AND public.user_can_schedule_employee(auth.uid(), e.id);
$$;
GRANT EXECUTE ON FUNCTION public.list_schedulable_employees(UUID) TO authenticated;

-- Lista colaboradores acima do usuário atual, agrupáveis por perfil (para o dialog de submissão)
CREATE OR REPLACE FUNCTION public.list_approvers_above(_company_id UUID)
RETURNS TABLE (user_id UUID, employee_id UUID, name TEXT, profile_code TEXT, profile_name TEXT, level INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT public.user_schedule_level(auth.uid(), _company_id) AS lvl)
  SELECT e.user_id, e.id, e.name, sp.code, sp.name, sp.hierarchy_level
    FROM public.employees e
    JOIN public.system_profiles sp ON sp.id = e.system_profile_id
   CROSS JOIN me
   WHERE e.company_id = _company_id
     AND e.is_active = true
     AND e.user_id IS NOT NULL
     AND e.user_id <> auth.uid()
     AND sp.can_approve_schedule = true
     AND sp.hierarchy_level < me.lvl;
$$;
GRANT EXECUTE ON FUNCTION public.list_approvers_above(UUID) TO authenticated;

-- Versão pública (sem SECURITY DEFINER) das funções de checagem, expostas como RPC
GRANT EXECUTE ON FUNCTION public.user_can_create_schedule(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_approve_schedule(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_schedule_employee(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_schedule_level(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
