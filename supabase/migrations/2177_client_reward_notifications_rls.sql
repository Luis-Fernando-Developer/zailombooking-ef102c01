-- ============================================================================
-- 2177 - Permite que clientes leiam suas notificações de brindes
-- ============================================================================

DROP POLICY IF EXISTS "company members read notifs" ON public.company_notifications;
CREATE POLICY "company members read notifs"
ON public.company_notifications
FOR SELECT
TO authenticated
USING (
  target_user_id = auth.uid()
  OR public.user_belongs_to_company(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "company members update notifs" ON public.company_notifications;
CREATE POLICY "company members update notifs"
ON public.company_notifications
FOR UPDATE
TO authenticated
USING (
  target_user_id = auth.uid()
  OR public.user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  target_user_id = auth.uid()
  OR public.user_belongs_to_company(auth.uid(), company_id)
);

NOTIFY pgrst, 'reload schema';
