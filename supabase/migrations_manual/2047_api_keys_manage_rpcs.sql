-- ============================================================================
-- 2047 — RPCs para gerenciar API Keys pela UI (criar / revogar)
-- ============================================================================

-- Cria uma API key para a empresa do usuário autenticado.
-- Gera segredo aleatório no servidor, armazena somente o hash sha256
-- e retorna o valor plaintext UMA ÚNICA VEZ.
CREATE OR REPLACE FUNCTION public.create_api_key(
  p_company_id uuid,
  p_name       text,
  p_scopes     text[] DEFAULT ARRAY['read','write']::text[]
)
RETURNS TABLE(id uuid, plaintext text, key_prefix text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret   text;
  v_full     text;
  v_hash     text;
  v_prefix   text;
  v_id       uuid;
BEGIN
  IF NOT public.user_belongs_to_company(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 32 bytes aleatórios em hex (64 chars) prefixados com zlm_
  v_secret := encode(gen_random_bytes(32), 'hex');
  v_full   := 'zlm_' || v_secret;
  v_hash   := encode(digest(v_full, 'sha256'), 'hex');
  v_prefix := substring(v_full FROM 1 FOR 12);

  INSERT INTO public.api_keys (company_id, name, key_prefix, key_hash, scopes)
  VALUES (p_company_id, p_name, v_prefix, v_hash, COALESCE(p_scopes, ARRAY['read','write']::text[]))
  RETURNING api_keys.id INTO v_id;

  RETURN QUERY SELECT v_id, v_full, v_prefix;
END $$;

GRANT EXECUTE ON FUNCTION public.create_api_key(uuid, text, text[]) TO authenticated;

-- Revoga (soft) uma API key da empresa do usuário.
CREATE OR REPLACE FUNCTION public.revoke_api_key(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.api_keys WHERE id = p_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_belongs_to_company(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.api_keys
     SET is_active = false, revoked_at = now()
   WHERE id = p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid) TO authenticated;
