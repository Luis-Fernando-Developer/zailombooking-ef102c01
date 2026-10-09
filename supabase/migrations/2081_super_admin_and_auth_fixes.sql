-- Migration manual para correções urgentes no Super Admin e Fluxo de Cliente
-- Objetivo: Corrigir receita, estatísticas e lógica de suspensão manual.

-- 1. Função para calcular receita total real por empresa para o Super Admin
CREATE OR REPLACE FUNCTION public.get_company_total_revenue(target_company_id UUID)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.company_invoices
  WHERE company_id = target_company_id
    AND status = 'paid';
$$;

GRANT EXECUTE ON FUNCTION public.get_company_total_revenue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_total_revenue(UUID) TO service_role;

-- 2. Garantir que as colunas de controle manual existem na tabela companies
-- (Já devem existir de migrações anteriores, mas garantimos aqui)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'companies' AND COLUMN_NAME = 'manual_resource_release_until') THEN
        ALTER TABLE public.companies ADD COLUMN manual_resource_release_until TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'companies' AND COLUMN_NAME = 'force_early_renewal_once') THEN
        ALTER TABLE public.companies ADD COLUMN force_early_renewal_once BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. Atualizar a lógica de verificação de empresa ativa para incluir a liberação manual
-- Nota: Esta lógica deve ser usada nas RLS e triggers que bloqueiam agendamentos.
CREATE OR REPLACE FUNCTION public.is_company_active(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.companies 
    WHERE id = target_company_id 
      AND (
        status = 'active' 
        OR (manual_resource_release_until IS NOT NULL AND manual_resource_release_until > now())
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_company_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_active(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_company_active(UUID) TO anon;

-- 4. Criar view consolidada para estatísticas do Super Admin (opcional, mas ajuda a performance)
CREATE OR REPLACE VIEW public.super_admin_stats AS
SELECT 
    (SELECT count(*) FROM public.companies) as total_companies,
    (SELECT count(*) FROM public.companies WHERE status = 'active' OR (manual_resource_release_until IS NOT NULL AND manual_resource_release_until > now())) as active_companies,
    (SELECT count(*) FROM public.profiles) as total_users,
    (SELECT count(*) FROM public.whatsapp_instances) as total_instances,
    (SELECT count(*) FROM public.subscription_plans WHERE is_active = true) as total_plans,
    (SELECT COALESCE(SUM(amount), 0) FROM public.company_invoices WHERE status = 'paid') as total_revenue;

GRANT SELECT ON public.super_admin_stats TO authenticated;
GRANT SELECT ON public.super_admin_stats TO service_role;
