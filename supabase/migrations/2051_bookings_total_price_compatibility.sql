-- ============================================================================
-- 2051 — Compatibilidade temporária para Edge Function antiga.
--
-- Sintoma:
--   [ADMIN_CREATE_BOOKING] Error: Could not find the 'total_price' column of
--   'bookings' in the schema cache
--
-- Causa:
--   O código atual já grava `bookings.price`, mas o Supabase externo ainda pode
--   estar executando uma versão antiga da Edge Function admin-create-booking que
--   envia `total_price` no insert. Enquanto o deploy da função não propaga, o
--   PostgREST rejeita o payload porque a coluna não existe no schema cache.
--
-- Solução defensiva:
--   Cria `total_price` como coluna de compatibilidade e mantém `price` e
--   `total_price` sincronizados em INSERT/UPDATE. Assim tanto o código novo
--   quanto o código antigo continuam funcionando.
-- ============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS total_price NUMERIC;

CREATE OR REPLACE FUNCTION public.sync_bookings_price_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS NULL AND NEW.total_price IS NOT NULL THEN
    NEW.price := NEW.total_price;
  END IF;

  IF NEW.total_price IS NULL AND NEW.price IS NOT NULL THEN
    NEW.total_price := NEW.price;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_bookings_price_columns ON public.bookings;
CREATE TRIGGER trg_sync_bookings_price_columns
BEFORE INSERT OR UPDATE OF price, total_price ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.sync_bookings_price_columns();

UPDATE public.bookings
   SET total_price = price
 WHERE total_price IS NULL
   AND price IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bookings TO anon;
GRANT ALL ON public.bookings TO service_role;

NOTIFY pgrst, 'reload schema';