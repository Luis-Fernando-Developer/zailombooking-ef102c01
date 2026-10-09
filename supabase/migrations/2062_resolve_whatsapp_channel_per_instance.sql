-- ============================================================================
-- 2062: resolve_whatsapp_channel passa a respeitar channel_preference da
-- instância padrão (whatsapp_instances.channel_preference) em vez de usar
-- apenas companies.whatsapp_channel_preference.
--
-- Ordem de decisão:
--   1. Se a empresa está com preferência 'disabled' -> 'none'
--   2. Pega a instância padrão conectada (is_default DESC, created_at ASC).
--      Usa o channel_preference dela:
--        - 'disabled'    -> 'none'
--        - 'flow_only'   -> 'flow' se Flow configurado, senão 'none'
--        - 'direct_only' -> 'direct'
--        - 'auto' (ou NULL) -> 'direct' se instância conectada, senão tenta flow
--   3. Sem instância conectada -> cai na preferência da empresa (compat).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_whatsapp_channel(p_company UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_pref TEXT;
  v_inst_pref    TEXT;
  v_has_inst     BOOLEAN := FALSE;
  v_flow_ok      BOOLEAN := FALSE;
BEGIN
  SELECT COALESCE(whatsapp_channel_preference,'auto') INTO v_company_pref
    FROM companies WHERE id = p_company;
  IF v_company_pref = 'disabled' THEN RETURN 'none'; END IF;

  SELECT COALESCE(is_active, false) INTO v_flow_ok
    FROM chatbot_integration WHERE company_id = p_company;
  v_flow_ok := COALESCE(v_flow_ok, false);

  -- Instância padrão conectada
  SELECT COALESCE(channel_preference, 'auto')
    INTO v_inst_pref
    FROM whatsapp_instances
   WHERE company_id = p_company
     AND status = 'connected'
   ORDER BY is_default DESC NULLS LAST, created_at ASC
   LIMIT 1;

  IF FOUND THEN
    v_has_inst := TRUE;
    IF v_inst_pref = 'disabled' THEN RETURN 'none'; END IF;
    IF v_inst_pref = 'flow_only' THEN
      RETURN CASE WHEN v_flow_ok THEN 'flow' ELSE 'none' END;
    END IF;
    IF v_inst_pref = 'direct_only' THEN RETURN 'direct'; END IF;
    -- auto: prefere direct (a instância existe e está conectada)
    RETURN 'direct';
  END IF;

  -- Sem instância conectada -> fallback para preferência da empresa
  IF v_company_pref IN ('auto','flow_only') AND v_flow_ok THEN RETURN 'flow'; END IF;
  RETURN 'none';
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_channel(UUID) TO authenticated, service_role;
