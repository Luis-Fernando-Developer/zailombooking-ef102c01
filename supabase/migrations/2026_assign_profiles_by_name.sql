-- ============================================================
-- Atribuição de system_profile_id aos employees existentes
-- Execute no SQL Editor. Ajuste o WHERE de company_id se quiser
-- limitar a uma empresa específica.
-- ============================================================

-- 1) DONO / OWNER  -> nivel 10
UPDATE public.employees e
   SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code = 'OWNER')
 WHERE e.name ILIKE '%dono%' OR e.name ILIKE '%owner%' OR e.name ILIKE '%proprietari%';

-- 2) GERENTE -> nivel 20
UPDATE public.employees e
   SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code = 'GERENTE')
 WHERE e.name ILIKE '%gerente%';

-- 3) RH -> nivel 30
UPDATE public.employees e
   SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code = 'RH')
 WHERE e.name ILIKE '%rh%' OR e.name ILIKE '%recursos humanos%';

-- 4) ENCARREGADO -> nivel 50
UPDATE public.employees e
   SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code = 'ENCARREGADO')
 WHERE e.name ILIKE '%encarregado%';

-- 5) RECEPCIONISTA -> nivel 60
UPDATE public.employees e
   SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code = 'RECEPCIONISTA')
 WHERE e.name ILIKE '%recepcionist%';

-- 6) PRESTADOR / CONVIDADO -> não escalável
UPDATE public.employees e
   SET system_profile_id = (SELECT id FROM public.system_profiles WHERE code = 'PRESTADOR')
 WHERE e.name ILIKE '%convidado%'
    OR e.name ILIKE '%prestador%'
    OR e.name ILIKE '%terceiriz%';

-- 7) Conferência
SELECT e.name, u.email, sp.code, sp.hierarchy_level
  FROM public.employees e
  LEFT JOIN auth.users u           ON u.id = e.user_id
  LEFT JOIN public.system_profiles sp ON sp.id = e.system_profile_id
 ORDER BY sp.hierarchy_level NULLS LAST, e.name;
