-- ============================================================================
-- Cenário de validação: profissional desligado
-- Roda no SQL Editor do Supabase. Cada bloco é independente.
-- Substitua <COMPANY_ID> e <EMPLOYEE_ID> pelos UUIDs reais antes de executar.
-- ============================================================================

-- 0. Pré-requisitos
--    * Migration 2032_availability_unified.sql aplicada.
--    * Empresa tem business_hours abertos no dia testado.
--    * Empresa tem schedule aprovado cobrindo a data testada com entry_type='T'.

-- ----------------------------------------------------------------------------
-- 1. Snapshot ANTES do desligamento (deve listar slots)
-- ----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '<COMPANY_ID>'::uuid  AS company,
    '<EMPLOYEE_ID>'::uuid AS employee,
    (SELECT id FROM public.services
       WHERE company_id = '<COMPANY_ID>'::uuid AND is_active LIMIT 1) AS service,
    (CURRENT_DATE + 3)    AS day
)
SELECT 'ANTES' AS fase, *
  FROM params, public.get_available_slots(company, employee, service, day);

-- ----------------------------------------------------------------------------
-- 2. Programa o desligamento para amanhã
-- ----------------------------------------------------------------------------
UPDATE public.employees
   SET termination_effective_date = CURRENT_DATE + 1,
       termination_reason         = 'TESTE: cenário de desligamento'
 WHERE id = '<EMPLOYEE_ID>'::uuid;

-- 3. Confirma que o trigger marcou as escalas futuras como D
SELECT entry_date, entry_type, start_time, end_time
  FROM public.schedule_entries
 WHERE employee_id = '<EMPLOYEE_ID>'::uuid
   AND entry_date >= CURRENT_DATE + 1
 ORDER BY entry_date
 LIMIT 10;
-- Esperado: TODAS as linhas com entry_type='D' e start_time/end_time NULL

-- ----------------------------------------------------------------------------
-- 4. Snapshot DEPOIS do desligamento (deve retornar 'terminated')
-- ----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '<COMPANY_ID>'::uuid  AS company,
    '<EMPLOYEE_ID>'::uuid AS employee,
    (SELECT id FROM public.services
       WHERE company_id = '<COMPANY_ID>'::uuid AND is_active LIMIT 1) AS service,
    (CURRENT_DATE + 3)    AS day
)
SELECT 'DEPOIS' AS fase, *
  FROM params, public.get_available_slots(company, employee, service, day);
-- Esperado: 1 linha (slot=NULL, reason='terminated')

-- 5. Gate de write também deve bloquear
SELECT public.is_slot_available(
  '<COMPANY_ID>'::uuid,
  '<EMPLOYEE_ID>'::uuid,
  (SELECT id FROM public.services WHERE company_id = '<COMPANY_ID>'::uuid LIMIT 1),
  CURRENT_DATE + 3,
  '10:00'::time
) AS should_be_false;
-- Esperado: false

-- ----------------------------------------------------------------------------
-- 6. Auditoria: agendamentos órfãos do colaborador desligado
-- ----------------------------------------------------------------------------
SELECT id, booking_date, start_time, booking_status, is_inconsistent
  FROM public.bookings_needing_action
 WHERE company_id = '<COMPANY_ID>'::uuid
   AND employee_id = '<EMPLOYEE_ID>'::uuid;
-- Esperado: agendamentos futuros desse colaborador aparecem com is_inconsistent=true
-- Eles devem ser realocados via /:slug/admin/realocacao

-- ----------------------------------------------------------------------------
-- 7. Rollback do teste
-- ----------------------------------------------------------------------------
-- UPDATE public.employees
--    SET termination_effective_date = NULL,
--        termination_reason         = NULL
--  WHERE id = '<EMPLOYEE_ID>'::uuid;
-- NOTE: as schedule_entries marcadas como 'D' NÃO são revertidas automaticamente.
-- Para restaurar, regenere a escala (UI) ou faça UPDATE manual nas entries afetadas.
