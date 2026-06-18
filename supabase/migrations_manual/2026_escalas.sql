-- ============================================================================
-- Módulo "Escalas Mensais" — Fase 1 (banco apenas)
-- Roda manual no SQL Editor. Idempotente.
-- Depende de: 2026_solicitacoes.sql (requests, user_belongs_to_company)
-- ============================================================================

-- 1. ENUMs
DO $$ BEGIN
  CREATE TYPE schedule_status AS ENUM ('draft','pending_approval','approved','partially_approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE schedule_entry_type AS ENUM ('T','F','A','FE','D');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE schedule_entry_decision AS ENUM ('pending','approved','rejected','revise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. schedule_templates (modelos criados pelo admin)
CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  pattern_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  cycle_length_days INTEGER NOT NULL DEFAULT 7,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_tenant ON public.schedule_templates(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_templates TO authenticated;
GRANT ALL ON public.schedule_templates TO service_role;

-- 3. schedule_cycles_config (ciclo de abertura/fechamento por tenant)
CREATE TABLE IF NOT EXISTS public.schedule_cycles_config (
  tenant_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  cycle_start_day SMALLINT NOT NULL DEFAULT 1 CHECK (cycle_start_day BETWEEN 1 AND 31),
  cycle_end_day   SMALLINT NOT NULL DEFAULT 31 CHECK (cycle_end_day BETWEEN 1 AND 31),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_cycles_config TO authenticated;
GRANT ALL ON public.schedule_cycles_config TO service_role;

-- 4. schedules (entidade-escala)
CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  status schedule_status NOT NULL DEFAULT 'draft',
  template_id UUID REFERENCES public.schedule_templates(id) ON DELETE SET NULL,
  request_id  UUID REFERENCES public.requests(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_schedules_tenant_period ON public.schedules(tenant_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON public.schedules(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;

-- 5. schedule_entries (linha por colaborador × data)
CREATE TABLE IF NOT EXISTS public.schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  entry_type schedule_entry_type NOT NULL DEFAULT 'T',
  start_time TIME,
  end_time   TIME,
  break_start TIME,
  break_end   TIME,
  decision_status schedule_entry_decision NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, employee_id, entry_date)
);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule ON public.schedule_entries(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_emp_date ON public.schedule_entries(employee_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_entries TO authenticated;
GRANT ALL ON public.schedule_entries TO service_role;

-- 6. triggers updated_at (reutiliza touch_updated_at do módulo solicitações)
DROP TRIGGER IF EXISTS trg_schedule_templates_updated_at ON public.schedule_templates;
CREATE TRIGGER trg_schedule_templates_updated_at BEFORE UPDATE ON public.schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_schedules_updated_at ON public.schedules;
CREATE TRIGGER trg_schedules_updated_at BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_schedule_entries_updated_at ON public.schedule_entries;
CREATE TRIGGER trg_schedule_entries_updated_at BEFORE UPDATE ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_cycle_config_updated_at ON public.schedule_cycles_config;
CREATE TRIGGER trg_cycle_config_updated_at BEFORE UPDATE ON public.schedule_cycles_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. RLS
ALTER TABLE public.schedule_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_cycles_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tpl_tenant_all"   ON public.schedule_templates;
CREATE POLICY "tpl_tenant_all" ON public.schedule_templates
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "cycle_tenant_all" ON public.schedule_cycles_config;
CREATE POLICY "cycle_tenant_all" ON public.schedule_cycles_config
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "sch_tenant_all"   ON public.schedules;
CREATE POLICY "sch_tenant_all" ON public.schedules
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "sch_entries_tenant_all" ON public.schedule_entries;
CREATE POLICY "sch_entries_tenant_all" ON public.schedule_entries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.id = schedule_id AND public.user_belongs_to_company(auth.uid(), s.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.id = schedule_id AND public.user_belongs_to_company(auth.uid(), s.tenant_id)
  ));

-- 8. Trigger: ao desligar colaborador, marca entries futuros como 'D'
CREATE OR REPLACE FUNCTION public.handle_employee_termination()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = FALSE AND OLD.is_active = TRUE THEN
    UPDATE public.schedule_entries
       SET entry_type = 'D', updated_at = NOW()
     WHERE employee_id = NEW.id
       AND entry_date >= CURRENT_DATE;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_employee_terminated ON public.employees;
CREATE TRIGGER trg_employee_terminated
  AFTER UPDATE OF is_active ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_employee_termination();
