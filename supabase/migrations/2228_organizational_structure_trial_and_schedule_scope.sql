-- 2228 — Estrutura organizacional configurável, vínculo único por grupo
-- e base de seleção de colaboradores para escalas de jornada.
BEGIN;

CREATE TABLE IF NOT EXISTS public.company_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE INDEX IF NOT EXISTS idx_company_sectors_order
  ON public.company_sectors(company_id, position, name);

CREATE TABLE IF NOT EXISTS public.company_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL REFERENCES public.company_sectors(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE INDEX IF NOT EXISTS idx_company_groups_sector
  ON public.company_groups(company_id, sector_id, position, name);

CREATE TABLE IF NOT EXISTS public.company_group_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.company_groups(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  max_members integer CHECK (max_members IS NULL OR max_members >= 1),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, name),
  UNIQUE (company_id, id)
);

CREATE TABLE IF NOT EXISTS public.company_group_position_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.company_group_positions(id) ON DELETE CASCADE,
  permission_code text NOT NULL CHECK (permission_code IN (
    'org.view_group','org.manage_group_members','org.manage_group_positions',
    'schedules.view_group','schedules.manage_group'
  )),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (position_id, permission_code)
);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS org_group_id uuid,
  ADD COLUMN IF NOT EXISTS org_position_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_org_group_fk') THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_org_group_fk
      FOREIGN KEY (org_group_id) REFERENCES public.company_groups(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_org_position_fk') THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_org_position_fk
      FOREIGN KEY (org_position_id) REFERENCES public.company_group_positions(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_employees_org_group ON public.employees(company_id, org_group_id);

CREATE TABLE IF NOT EXISTS public.employee_org_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  from_group_id uuid REFERENCES public.company_groups(id) ON DELETE SET NULL,
  to_group_id uuid REFERENCES public.company_groups(id) ON DELETE SET NULL,
  from_position_id uuid REFERENCES public.company_group_positions(id) ON DELETE SET NULL,
  to_position_id uuid REFERENCES public.company_group_positions(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES auth.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_org_history_employee
  ON public.employee_org_history(employee_id, created_at DESC);

ALTER TABLE public.company_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_group_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_group_position_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_org_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_sectors_company_access ON public.company_sectors;
CREATE POLICY company_sectors_company_access ON public.company_sectors
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS company_groups_company_access ON public.company_groups;
CREATE POLICY company_groups_company_access ON public.company_groups
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS company_group_positions_company_access ON public.company_group_positions;
CREATE POLICY company_group_positions_company_access ON public.company_group_positions
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS company_group_position_permissions_company_access ON public.company_group_position_permissions;
CREATE POLICY company_group_position_permissions_company_access ON public.company_group_position_permissions
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS employee_org_history_company_access ON public.employee_org_history;
CREATE POLICY employee_org_history_company_access ON public.employee_org_history
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

GRANT SELECT ON public.company_sectors, public.company_groups,
  public.company_group_positions, public.company_group_position_permissions,
  public.employee_org_history TO authenticated;
GRANT ALL ON public.company_sectors, public.company_groups,
  public.company_group_positions, public.company_group_position_permissions,
  public.employee_org_history TO service_role;

-- Proprietário/admin controla a estrutura. Líderes só podem operar no próprio grupo
-- quando o proprietário habilitar a permissão correspondente ao cargo.
CREATE OR REPLACE FUNCTION public.user_can_manage_org_group(_user_id uuid, _group_id uuid, _permission text DEFAULT 'org.manage_group_members')
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_role text;
  v_employee uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.company_groups WHERE id = _group_id;
  IF v_company IS NULL OR NOT public.user_belongs_to_company(_user_id, v_company) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = v_company AND lower(c.owner_email) = lower((SELECT email FROM auth.users WHERE id = _user_id))
  ) THEN RETURN true; END IF;

  SELECT id, lower(coalesce(role::text,'')) INTO v_employee, v_role
    FROM public.employees WHERE company_id = v_company AND user_id = _user_id
    LIMIT 1;
  IF v_employee IS NULL OR v_role IN ('employee','receptionist') THEN
    -- perfil comum não ganha permissão implícita
    NULL;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.company_group_positions p ON p.id = e.org_position_id
    JOIN public.company_group_position_permissions pp ON pp.position_id = p.id
    WHERE e.id = v_employee
      AND e.org_group_id = _group_id
      AND pp.company_id = v_company
      AND pp.permission_code = _permission
      AND pp.enabled = true
  );
END;
$$;

-- A consulta de escala de jornada não exige que o funcionário seja profissional
-- agendável. Mantém apenas vínculo vigente e autorização hierárquica existente.
CREATE OR REPLACE FUNCTION public.list_company_employees_for_schedules(
  _company_id uuid,
  _as_of date DEFAULT CURRENT_DATE
)
RETURNS TABLE(id uuid, name text, profile_code text, profile_name text, level integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.id, e.name, sp.code, sp.name, coalesce(sp.hierarchy_level, 999)
  FROM public.employees e
  LEFT JOIN public.system_profiles sp ON sp.id = e.system_profile_id
  WHERE e.company_id = _company_id
    AND (
      e.is_active = true
      OR (e.termination_effective_date IS NOT NULL AND e.termination_effective_date > _as_of)
    )
    AND (
      public.user_can_schedule_employee(auth.uid(), e.id)
      OR (
        e.org_group_id IS NOT NULL
        AND public.user_can_manage_org_group(auth.uid(), e.org_group_id, 'schedules.manage_group')
      )
    )
  ORDER BY e.name;
$$;
REVOKE ALL ON FUNCTION public.list_company_employees_for_schedules(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_employees_for_schedules(uuid,date) TO authenticated;

-- Metadados de trial ficam na assinatura já existente; não cria cobrança nem ledger paralelo.
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS trial_converted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_trial_expiry
  ON public.company_subscriptions(trial_ends_at)
  WHERE trial_started_at IS NOT NULL AND trial_converted_at IS NULL;

CREATE OR REPLACE FUNCTION public.admin_start_company_trial(
  _company_id uuid,
  _plan_id uuid,
  _days integer,
  _actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plans%ROWTYPE;
  v_sub public.company_subscriptions%ROWTYPE;
  v_start timestamptz := now();
  v_end timestamptz;
BEGIN
  IF _days NOT IN (7,14,30) THEN
    RAISE EXCEPTION 'Duração de trial inválida. Use 7, 14 ou 30 dias.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.super_admins sa
    WHERE sa.user_id = _actor_user_id
      AND coalesce(nullif(to_jsonb(sa)->>'active','')::boolean,
                   nullif(to_jsonb(sa)->>'is_active','')::boolean, true) = true
  ) THEN
    RAISE EXCEPTION 'Somente Super Admin ativo pode iniciar trial.';
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = _plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano selecionado não encontrado ou inativo.'; END IF;

  SELECT * INTO v_sub FROM public.company_subscriptions WHERE company_id = _company_id FOR UPDATE;
  IF FOUND AND v_sub.asaas_subscription_id IS NOT NULL THEN
    RAISE EXCEPTION 'A empresa já possui assinatura vinculada ao Asaas. Não é possível iniciar trial por cima dela.';
  END IF;
  v_end := v_start + make_interval(days => _days);

  IF FOUND THEN
    UPDATE public.company_subscriptions SET
      plan_id = _plan_id,
      billing_period = 'monthly',
      status = 'active',
      billing_status = 'active',
      trial_started_at = v_start,
      trial_ends_at = v_end,
      trial_created_by = _actor_user_id,
      trial_converted_at = NULL,
      updated_at = now()
    WHERE id = v_sub.id;
  ELSE
    INSERT INTO public.company_subscriptions(
      company_id, plan_id, billing_period, status, billing_status,
      cycle_start_at, next_renewal_at, next_billing_date,
      trial_started_at, trial_ends_at, trial_created_by
    ) VALUES (
      _company_id, _plan_id, 'monthly', 'active', 'active',
      v_start, v_end, v_end, v_start, v_end, _actor_user_id
    );
  END IF;

  UPDATE public.companies SET
    plan_id = _plan_id,
    billing_period = 'monthly',
    status = 'trial'
  WHERE id = _company_id;

  RETURN jsonb_build_object('success', true, 'trial_started_at', v_start, 'trial_ends_at', v_end, 'plan_id', _plan_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_start_company_trial(uuid,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_start_company_trial(uuid,uuid,integer,uuid) TO service_role;

-- Expiração sob demanda no momento de qualquer nova reserva; dados permanecem intactos.
CREATE OR REPLACE FUNCTION public.enforce_trial_expiration_on_bookings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_trial_end timestamptz;
BEGIN
  SELECT trial_ends_at INTO v_trial_end
  FROM public.company_subscriptions
  WHERE company_id = NEW.company_id
    AND trial_started_at IS NOT NULL
    AND trial_converted_at IS NULL
  LIMIT 1;

  IF v_trial_end IS NOT NULL AND now() >= v_trial_end THEN
    UPDATE public.company_subscriptions
      SET status = 'suspended', billing_status = 'suspended', updated_at = now()
    WHERE company_id = NEW.company_id AND trial_converted_at IS NULL;
    UPDATE public.companies SET status = 'suspended' WHERE id = NEW.company_id AND status = 'trial';
    RAISE EXCEPTION USING MESSAGE = 'O período de teste terminou. Escolha um plano para continuar.', DETAIL = 'trial_expired', ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_trial_expiration_on_bookings ON public.bookings;
CREATE TRIGGER trg_enforce_trial_expiration_on_bookings
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trial_expiration_on_bookings();


-- Operações organizacionais são RPCs para que a validação não dependa do frontend.
CREATE OR REPLACE FUNCTION public.user_can_admin_company_org(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $
  SELECT
    EXISTS (SELECT 1 FROM public.companies c
      JOIN auth.users u ON lower(u.email) = lower(c.owner_email)
      WHERE c.id = _company_id AND u.id = _user_id)
    OR EXISTS (SELECT 1 FROM public.employees e
      WHERE e.company_id = _company_id AND e.user_id = _user_id
        AND lower(coalesce(e.role::text,'')) IN ('owner','admin'));
$;

CREATE OR REPLACE FUNCTION public.org_upsert_sector(
  _company_id uuid, _sector_id uuid, _name text, _description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
DECLARE v_id uuid;
BEGIN
  IF NOT public.user_can_admin_company_org(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sem permissão para administrar setores.';
  END IF;
  IF length(trim(coalesce(_name,''))) = 0 THEN RAISE EXCEPTION 'Informe o nome do setor.'; END IF;
  IF _sector_id IS NULL THEN
    INSERT INTO public.company_sectors(company_id,name,description,created_by)
    VALUES (_company_id,trim(_name),_description,auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.company_sectors SET name=trim(_name),description=_description,updated_at=now()
    WHERE id=_sector_id AND company_id=_company_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Setor não encontrado.'; END IF;
  END IF;
  RETURN v_id;
END $;

CREATE OR REPLACE FUNCTION public.org_upsert_group(
  _company_id uuid, _sector_id uuid, _group_id uuid, _name text, _description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
DECLARE v_id uuid;
BEGIN
  IF NOT public.user_can_admin_company_org(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sem permissão para administrar grupos.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_sectors WHERE id=_sector_id AND company_id=_company_id) THEN
    RAISE EXCEPTION 'Setor inválido para esta empresa.';
  END IF;
  IF length(trim(coalesce(_name,''))) = 0 THEN RAISE EXCEPTION 'Informe o nome do grupo.'; END IF;
  IF _group_id IS NULL THEN
    INSERT INTO public.company_groups(company_id,sector_id,name,description,created_by)
    VALUES (_company_id,_sector_id,trim(_name),_description,auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.company_groups SET sector_id=_sector_id,name=trim(_name),description=_description,updated_at=now()
    WHERE id=_group_id AND company_id=_company_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Grupo não encontrado.'; END IF;
  END IF;
  RETURN v_id;
END $;

CREATE OR REPLACE FUNCTION public.org_upsert_group_position(
  _company_id uuid, _group_id uuid, _position_id uuid, _name text, _max_members integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
DECLARE v_id uuid;
BEGIN
  IF NOT public.user_can_admin_company_org(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Somente o proprietário ou administrador pode configurar cargos organizacionais.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_groups WHERE id=_group_id AND company_id=_company_id) THEN
    RAISE EXCEPTION 'Grupo inválido.';
  END IF;
  IF _max_members IS NOT NULL AND _max_members < 1 THEN RAISE EXCEPTION 'Limite de ocupantes inválido.'; END IF;
  IF _position_id IS NULL THEN
    INSERT INTO public.company_group_positions(company_id,group_id,name,max_members)
    VALUES (_company_id,_group_id,trim(_name),_max_members) RETURNING id INTO v_id;
  ELSE
    UPDATE public.company_group_positions SET group_id=_group_id,name=trim(_name),max_members=_max_members
    WHERE id=_position_id AND company_id=_company_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Cargo organizacional não encontrado.'; END IF;
  END IF;
  RETURN v_id;
END $;

CREATE OR REPLACE FUNCTION public.org_set_position_permission(
  _company_id uuid, _position_id uuid, _permission_code text, _enabled boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
BEGIN
  IF NOT public.user_can_admin_company_org(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Somente o proprietário ou administrador pode delegar permissões.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_group_positions WHERE id=_position_id AND company_id=_company_id) THEN
    RAISE EXCEPTION 'Cargo organizacional não encontrado.';
  END IF;
  INSERT INTO public.company_group_position_permissions(company_id,position_id,permission_code,enabled)
  VALUES (_company_id,_position_id,_permission_code,_enabled)
  ON CONFLICT (position_id,permission_code) DO UPDATE SET enabled=EXCLUDED.enabled;
  RETURN true;
END $;

CREATE OR REPLACE FUNCTION public.org_move_employee(
  _company_id uuid, _employee_id uuid, _target_group_id uuid,
  _target_position_id uuid DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
DECLARE v_from_group uuid; v_from_position uuid; v_actor uuid := auth.uid();
BEGIN
  SELECT org_group_id,org_position_id INTO v_from_group,v_from_position
  FROM public.employees WHERE id=_employee_id AND company_id=_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado nesta empresa.'; END IF;
  IF _target_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_groups WHERE id=_target_group_id AND company_id=_company_id
  ) THEN RAISE EXCEPTION 'Grupo de destino inválido.'; END IF;
  IF _target_position_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_group_positions
    WHERE id=_target_position_id AND company_id=_company_id AND group_id=_target_group_id
  ) THEN RAISE EXCEPTION 'Cargo de destino não pertence ao grupo selecionado.'; END IF;

  IF NOT public.user_can_admin_company_org(v_actor,_company_id) THEN
    IF v_from_group IS NULL OR _target_group_id IS NULL
      OR NOT public.user_can_manage_org_group(v_actor,v_from_group,'org.manage_group_members')
      OR NOT public.user_can_manage_org_group(v_actor,_target_group_id,'org.manage_group_members') THEN
      RAISE EXCEPTION 'Você não pode movimentar colaboradores entre esses grupos.';
    END IF;
  END IF;

  IF _target_position_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.company_group_positions p
      WHERE p.id=_target_position_id AND p.max_members IS NOT NULL
        AND (SELECT count(*) FROM public.employees e WHERE e.org_position_id=p.id AND e.id<>_employee_id) >= p.max_members
    ) THEN RAISE EXCEPTION 'Esse cargo atingiu o limite de ocupantes.'; END IF;
  END IF;

  INSERT INTO public.employee_org_history(
    company_id,employee_id,from_group_id,to_group_id,from_position_id,to_position_id,changed_by,reason
  ) VALUES (_company_id,_employee_id,v_from_group,_target_group_id,v_from_position,_target_position_id,v_actor,_reason);

  UPDATE public.employees SET org_group_id=_target_group_id,org_position_id=_target_position_id
  WHERE id=_employee_id AND company_id=_company_id;
  RETURN true;
END $;

GRANT EXECUTE ON FUNCTION public.org_upsert_sector(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_upsert_group(uuid,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_upsert_group_position(uuid,uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_set_position_permission(uuid,uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_move_employee(uuid,uuid,uuid,uuid,text) TO authenticated;


-- Ao converter o trial em assinatura paga, encerra o estado de trial.
CREATE OR REPLACE FUNCTION public.mark_trial_converted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
BEGIN
  IF NEW.trial_started_at IS NOT NULL
     AND NEW.trial_converted_at IS NULL
     AND NEW.asaas_subscription_id IS NOT NULL
     AND NEW.billing_status = 'active' THEN
    NEW.trial_converted_at := now();
  END IF;
  RETURN NEW;
END $;
DROP TRIGGER IF EXISTS trg_mark_trial_converted ON public.company_subscriptions;
CREATE TRIGGER trg_mark_trial_converted
  BEFORE UPDATE OF asaas_subscription_id, billing_status ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.mark_trial_converted();

NOTIFY pgrst, 'reload schema';
COMMIT;
