-- Tabela de intervalos por colaborador (vinculada ao ciclo de escala vigente)
CREATE TABLE IF NOT EXISTS public.employee_breaks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  cycle_id    uuid NULL,
  break_type  text NOT NULL CHECK (break_type IN ('fixed','flexible')),
  start_time  time NULL,
  end_time    time NULL,
  duration_min integer NULL,
  window_start time NULL,
  window_end   time NULL,
  weekdays     integer[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_breaks_company ON public.employee_breaks(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_breaks_employee ON public.employee_breaks(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_breaks_cycle ON public.employee_breaks(cycle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_breaks TO authenticated;
GRANT ALL ON public.employee_breaks TO service_role;

ALTER TABLE public.employee_breaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emp_breaks_tenant_all" ON public.employee_breaks;
CREATE POLICY "emp_breaks_tenant_all" ON public.employee_breaks
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
