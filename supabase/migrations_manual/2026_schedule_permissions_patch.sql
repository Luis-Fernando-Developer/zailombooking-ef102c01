-- ============================================================================
-- 2026_schedule_permissions_patch.sql
-- Diagnóstico e correções pós-deploy.
-- Rodar no SQL Editor APÓS 2026_schedule_permissions.sql.
-- ============================================================================

-- 1) DIAGNÓSTICO: liste seus colaboradores e o nível atual deles
--    Use isso para identificar quem está sem system_profile_id.
-- ----------------------------------------------------------------------------
-- SELECT e.id, e.name, e.user_id IS NOT NULL AS has_user,
--        sp.code AS perfil, sp.hierarchy_level AS lvl,
--        sp.can_create_schedule, sp.can_approve_schedule
--   FROM public.employees e
--   LEFT JOIN public.system_profiles sp ON sp.id = e.system_profile_id
--  WHERE e.company_id = '<COLE_O_COMPANY_ID_AQUI>'
--  ORDER BY sp.hierarchy_level NULLS LAST, e.name;

-- 2) FALLBACK: employees sem system_profile_id recebem PROFISSIONAL por padrão.
--    Isso evita que o user_schedule_level retorne 999 e quebre as RPCs.
-- ----------------------------------------------------------------------------
UPDATE public.employees e
   SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code = 'PROFISSIONAL' LIMIT 1)
 WHERE e.system_profile_id IS NULL;

-- 3) Ajuste o perfil correto dos seus testes (exemplo).
--    Descomente e edite com os IDs reais antes de rodar.
-- ----------------------------------------------------------------------------
-- UPDATE public.employees SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code='ENCARREGADO')
--  WHERE name ILIKE '%encarregado 01%';
-- UPDATE public.employees SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code='GERENTE')
--  WHERE name ILIKE '%gerente 01%';
-- UPDATE public.employees SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code='RECEPCIONISTA')
--  WHERE name ILIKE '%recepcionista 01%';

-- 4) Marca "convidado/prestador" como NÃO escalável (can_be_scheduled=false no perfil dele)
--    OU desativa o flag por colaborador. Aqui usamos um perfil específico:
-- ----------------------------------------------------------------------------
-- Cria perfil PRESTADOR se não existir
INSERT INTO public.system_profiles (code, name, hierarchy_level, can_create_schedule, can_approve_schedule, can_be_scheduled)
VALUES ('PRESTADOR', 'Prestador de Serviço', 90, false, false, false)
ON CONFLICT (code) DO UPDATE SET can_be_scheduled = false;

-- Atribua o perfil PRESTADOR aos convidados/prestadores:
-- UPDATE public.employees SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code='PRESTADOR')
--  WHERE name ILIKE '%convidado%' OR name ILIKE '%prestador%';

-- 5) Ajuste a RPC list_schedulable_employees para respeitar can_be_scheduled
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_schedulable_employees(_company_id UUID)
RETURNS TABLE (id UUID, name TEXT, profile_code TEXT, profile_name TEXT, level INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.name, sp.code, sp.name, COALESCE(sp.hierarchy_level, 999)
    FROM public.employees e
    LEFT JOIN public.system_profiles sp ON sp.id = e.system_profile_id
   WHERE e.company_id = _company_id
     AND e.is_active = true
     AND COALESCE(sp.can_be_scheduled, true) = true
     AND public.user_can_schedule_employee(auth.uid(), e.id);
$$;

NOTIFY pgrst, 'reload schema';
