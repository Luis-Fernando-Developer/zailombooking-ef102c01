-- ============================================================================
-- 2037 — Corrige trigger de desligamento e REPARA entries marcadas
--         erroneamente como 'D' antes da data efetiva de desligamento.
--
-- Causa do bug: o trigger antigo (2026/2032) só "marca" entries como 'D' e
-- nunca reverte. Se o admin salvou o cadastro do colaborador com:
--   a) is_active = FALSE em algum momento (cutoff = CURRENT_DATE), OU
--   b) termination_effective_date inicialmente em data anterior, depois
--      empurrada para frente (ex.: 30/06 → 16/07),
-- todas as entries a partir do cutoff antigo permaneceram 'D'. Resultado:
-- get_available_slots devolve 'off_D' para 02/07..15/07 mesmo com o
-- colaborador ainda ativo nesse período.
--
-- Esta migration:
-- 1) Substitui o trigger por uma versão que ANTES reverte 'D' indevidas
--    (entries < cutoff) usando o template da escala (fallback business_hours),
--    e DEPOIS aplica 'D' a partir do cutoff.
-- 2) Roda uma única vez um reparo no estado atual: dispara o trigger
--    em todos os colaboradores com termination_effective_date NOT NULL.
--
-- Deploy manual. Sem alteração de verify_jwt.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_employee_termination()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cutoff DATE;
  v_emp    UUID := NEW.id;
BEGIN
  v_cutoff := COALESCE(
                NEW.termination_effective_date,
                CASE WHEN NEW.is_active = FALSE THEN CURRENT_DATE ELSE NULL END
              );

  -- 1) REPARO: reverte 'D' indevidamente aplicadas para datas anteriores
  --    ao cutoff (ou todas, se cutoff é NULL — colaborador "re-ativado").
  WITH targets AS (
    SELECT se.id, se.schedule_id, se.entry_date, s.period_start, s.template_id
      FROM public.schedule_entries se
      JOIN public.schedules s ON s.id = se.schedule_id
     WHERE se.employee_id = v_emp
       AND se.entry_type = 'D'
       AND (v_cutoff IS NULL OR se.entry_date < v_cutoff)
  ),
  resolved AS (
    SELECT
      t.id,
      COALESCE(
        (tpl.pattern_days
          -> (((t.entry_date - t.period_start)::int)
              % GREATEST(jsonb_array_length(COALESCE(tpl.pattern_days, '[]'::jsonb)), 1))
        ),
        NULL
      ) AS p,
      bh.is_open       AS bh_open,
      bh.open_time     AS bh_open_t,
      bh.close_time    AS bh_close_t
    FROM targets t
    LEFT JOIN public.schedule_templates tpl ON tpl.id = t.template_id
    LEFT JOIN public.business_hours bh
      ON bh.company_id = (SELECT tenant_id FROM public.schedules WHERE id = t.schedule_id)
     AND bh.day_of_week = EXTRACT(DOW FROM t.entry_date)::int
  )
  UPDATE public.schedule_entries se
     SET entry_type = CASE
                        WHEN r.p IS NOT NULL AND COALESCE((r.p->>'work')::boolean, false)
                          THEN 'T'::schedule_entry_type
                        WHEN r.p IS NOT NULL
                          THEN 'F'::schedule_entry_type
                        WHEN r.bh_open IS TRUE
                          THEN 'T'::schedule_entry_type
                        ELSE 'F'::schedule_entry_type
                      END,
         start_time = CASE
                        WHEN r.p IS NOT NULL AND COALESCE((r.p->>'work')::boolean, false)
                          THEN NULLIF(r.p->>'start','')::time
                        WHEN r.p IS NULL AND r.bh_open IS TRUE
                          THEN r.bh_open_t
                        ELSE NULL
                      END,
         end_time   = CASE
                        WHEN r.p IS NOT NULL AND COALESCE((r.p->>'work')::boolean, false)
                          THEN NULLIF(r.p->>'end','')::time
                        WHEN r.p IS NULL AND r.bh_open IS TRUE
                          THEN r.bh_close_t
                        ELSE NULL
                      END,
         break_start = CASE
                        WHEN r.p IS NOT NULL AND COALESCE((r.p->>'work')::boolean, false)
                          THEN NULLIF(r.p->>'break_start','')::time
                        ELSE NULL
                      END,
         break_end   = CASE
                        WHEN r.p IS NOT NULL AND COALESCE((r.p->>'work')::boolean, false)
                          THEN NULLIF(r.p->>'break_end','')::time
                        ELSE NULL
                      END,
         updated_at = NOW()
    FROM resolved r
   WHERE se.id = r.id;

  -- 2) Aplica 'D' a partir do cutoff (comportamento original)
  IF v_cutoff IS NOT NULL THEN
    UPDATE public.schedule_entries
       SET entry_type = 'D',
           start_time = NULL, end_time = NULL,
           break_start = NULL, break_end = NULL,
           updated_at = NOW()
     WHERE employee_id = v_emp
       AND entry_date >= v_cutoff
       AND entry_type <> 'D';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_employee_terminated ON public.employees;
CREATE TRIGGER trg_employee_terminated
  AFTER UPDATE OF is_active, termination_effective_date ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_employee_termination();

-- ============================================================================
-- REPARO de uma única vez: força a re-execução do trigger para todos os
-- colaboradores com termination_effective_date NOT NULL. Isso vai reverter
-- as 'D' antigas indevidas e reaplicar as corretas a partir da data efetiva.
-- ============================================================================
UPDATE public.employees
   SET termination_effective_date = termination_effective_date
 WHERE termination_effective_date IS NOT NULL;

-- Reparo adicional para colaboradores ativos sem termination, caso tenham
-- entries 'D' residuais (não devem existir, mas garante consistência).
UPDATE public.employees
   SET is_active = is_active
 WHERE is_active = TRUE
   AND termination_effective_date IS NULL
   AND EXISTS (
     SELECT 1 FROM public.schedule_entries se
      WHERE se.employee_id = employees.id
        AND se.entry_type  = 'D'
        AND se.entry_date >= CURRENT_DATE
   );

NOTIFY pgrst, 'reload schema';
