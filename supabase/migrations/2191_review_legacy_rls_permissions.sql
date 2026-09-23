-- FASE 10.12 — revisão/consolidação das RLS antigas.
--
-- Remove somente policies de authenticated/public que ainda dependam do antigo
-- helper de pertencimento simples nas tabelas já migradas nesta Fase 10.
-- Não toca policies de anon nem service_role e não altera tabelas fora do escopo.
-- As policies novas baseadas em user_has_company_permission() permanecem.

DO $$
DECLARE
  t text;
  p record;
  tables text[] := ARRAY[
    'schedule_templates',
    'schedule_cycles_config',
    'schedules',
    'schedule_entries',
    'schedule_audit_log',
    'marketing_materials',
    'marketing_campaigns',
    'marketing_campaign_materials',
    'marketing_approvals',
    'marketing_history',
    'company_invoices',
    'company_payment_methods',
    'company_payment_tokens',
    'autonomous_payouts',
    'payment_adjustments',
    'booking_payments',
    'company_customizations',
    'chatbot_integration',
    'api_keys',
    'whatsapp_integration',
    'whatsapp_instances',
    'whatsapp_templates',
    'whatsapp_message_usage',
    'requests',
    'request_comments',
    'request_audit_log',
    'request_approval_rules',
    'employee_absences',
    'employee_documents',
    'employee_evaluations',
    'employee_history'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    FOR p IN
      SELECT policyname, COALESCE(qual,'') || ' ' || COALESCE(with_check,'') AS expr
      FROM pg_policies
      WHERE schemaname='public'
        AND tablename=t
        AND (
          roles::text ILIKE '%authenticated%'
          OR roles::text ILIKE '%public%'
        )
    LOOP
      IF p.expr ILIKE '%user_belongs_to_company(%'
         OR p.policyname ILIKE '%tenant_all%'
         OR p.policyname ILIKE '%company%all%'
      THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Garantia: as tabelas principais continuam com RLS habilitada.
ALTER TABLE IF EXISTS public.schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedule_cycles_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_history ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
