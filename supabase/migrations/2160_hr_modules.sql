-- FASE 8 — Módulos de RH: Documentos, Avaliações e Histórico

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'outro',
  description TEXT,
  file_path TEXT,
  file_url TEXT,
  expires_at DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_documents_company ON public.employee_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON public.employee_documents(employee_id);

CREATE TABLE IF NOT EXISTS public.employee_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period TEXT,
  score NUMERIC(4,2),
  strengths TEXT,
  improvements TEXT,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (score IS NULL OR (score >= 0 AND score <= 10))
);
CREATE INDEX IF NOT EXISTS idx_employee_evaluations_company ON public.employee_evaluations(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_evaluations_employee ON public.employee_evaluations(employee_id);

CREATE TABLE IF NOT EXISTS public.employee_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  old_data JSONB,
  new_data JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_history_company ON public.employee_history(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_history_employee ON public.employee_history(employee_id, created_at DESC);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_documents_tenant_all ON public.employee_documents;
CREATE POLICY employee_documents_tenant_all ON public.employee_documents FOR ALL TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS employee_evaluations_tenant_all ON public.employee_evaluations;
CREATE POLICY employee_evaluations_tenant_all ON public.employee_evaluations FOR ALL TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS employee_history_tenant_select ON public.employee_history;
CREATE POLICY employee_history_tenant_select ON public.employee_history FOR SELECT TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_evaluations TO authenticated;
GRANT SELECT ON public.employee_history TO authenticated;
GRANT ALL ON public.employee_documents, public.employee_evaluations, public.employee_history TO service_role;

DROP TRIGGER IF EXISTS trg_employee_documents_updated_at ON public.employee_documents;
CREATE TRIGGER trg_employee_documents_updated_at BEFORE UPDATE ON public.employee_documents
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_employee_evaluations_updated_at ON public.employee_evaluations;
CREATE TRIGGER trg_employee_evaluations_updated_at BEFORE UPDATE ON public.employee_evaluations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.record_employee_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_event TEXT;
  v_title TEXT;
BEGIN
  v_company := COALESCE(NEW.company_id, OLD.company_id);
  v_name := COALESCE(NEW.name, OLD.name, 'Colaborador');

  IF TG_OP = 'INSERT' THEN
    v_event := 'created';
    v_title := 'Colaborador cadastrado';
  ELSIF TG_OP = 'DELETE' THEN
    v_event := 'deleted';
    v_title := 'Colaborador removido';
  ELSE
    v_event := 'updated';
    v_title := 'Dados do colaborador alterados';
  END IF;

  INSERT INTO public.employee_history (company_id, employee_id, event_type, title, description, old_data, new_data, created_by)
  VALUES (
    v_company,
    COALESCE(NEW.id, OLD.id),
    v_event,
    v_title,
    v_name,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_record_employee_history ON public.employees;
CREATE TRIGGER trg_record_employee_history
AFTER INSERT OR UPDATE OR DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.record_employee_history();

-- Storage para documentos de colaboradores.
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS employee_documents_storage_select ON storage.objects;
CREATE POLICY employee_documents_storage_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'employee-documents' AND public.user_belongs_to_company(auth.uid(), split_part(name, '/', 1)::uuid));

DROP POLICY IF EXISTS employee_documents_storage_insert ON storage.objects;
CREATE POLICY employee_documents_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'employee-documents' AND public.user_belongs_to_company(auth.uid(), split_part(name, '/', 1)::uuid));

DROP POLICY IF EXISTS employee_documents_storage_update ON storage.objects;
CREATE POLICY employee_documents_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'employee-documents' AND public.user_belongs_to_company(auth.uid(), split_part(name, '/', 1)::uuid));

DROP POLICY IF EXISTS employee_documents_storage_delete ON storage.objects;
CREATE POLICY employee_documents_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'employee-documents' AND public.user_belongs_to_company(auth.uid(), split_part(name, '/', 1)::uuid));