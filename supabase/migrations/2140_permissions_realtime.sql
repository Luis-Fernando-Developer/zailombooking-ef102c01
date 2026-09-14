-- Keep permission-aware UI synchronized when employee permissions change.
-- This migration is intended for DEV first; do not push to PROD yet.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'employee_permissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_permissions;
  END IF;
END
$$;
