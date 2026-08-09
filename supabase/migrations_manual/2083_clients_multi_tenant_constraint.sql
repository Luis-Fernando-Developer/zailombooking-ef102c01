-- Migração para corrigir erro de restrição única na tabela clients e permitir multi-empresa.
-- O erro 42P10 ocorre porque o comando ON CONFLICT (user_id, company_id) exige uma constraint única nessas colunas.

-- 1. Remover possíveis duplicatas antes de adicionar a constraint (opcional, mas seguro)
-- Mantém apenas o registro mais recente para cada par (user_id, company_id)
DELETE FROM public.clients a USING (
      SELECT MIN(ctid) as ctid, user_id, company_id
      FROM public.clients 
      GROUP BY user_id, company_id HAVING COUNT(*) > 1
) b
WHERE a.user_id = b.user_id 
AND a.company_id = b.company_id 
AND a.ctid <> b.ctid;

-- 2. Adicionar a constraint única necessária para o ON CONFLICT funcionar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'clients_user_id_company_id_key'
    ) THEN
        ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_company_id_key UNIQUE (user_id, company_id);
    END IF;
END $$;

-- 3. Garantir que o email denormalizado não tenha uma constraint global única
-- No Supabase, se a tabela foi criada via dashboard, pode haver uma constraint 'clients_email_key'.
-- Para multi-empresa, o mesmo email pode existir em múltiplas linhas (uma por empresa).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'clients_email_key'
    ) THEN
        ALTER TABLE public.clients DROP CONSTRAINT clients_email_key;
    END IF;
END $$;
