-- Chat: access is controlled by the granular permission model, not by employee role.
-- chat.view = may access/read chat
-- chat.send = may send messages
-- The employee_role enum does not contain 'admin'.
-- Company owners are identified by companies.owner_email and the owner role.

CREATE OR REPLACE FUNCTION public.user_can_chat(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.companies c
      JOIN auth.users u ON lower(trim(u.email)) = lower(trim(c.owner_email))
      WHERE c.id = _company_id
        AND u.id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.company_id = _company_id
        AND e.user_id = _user_id
        AND e.role = 'owner'
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.employee_permissions ep ON ep.employee_id = e.id
      JOIN public.permissions p ON p.id = ep.permission_id
      WHERE e.company_id = _company_id
        AND e.user_id = _user_id
        AND p.code = 'chat.view'
        AND p.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_send_chat(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.companies c
      JOIN auth.users u ON lower(trim(u.email)) = lower(trim(c.owner_email))
      WHERE c.id = _company_id
        AND u.id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.company_id = _company_id
        AND e.user_id = _user_id
        AND e.role = 'owner'
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.employee_permissions ep ON ep.employee_id = e.id
      JOIN public.permissions p ON p.id = ep.permission_id
      WHERE e.company_id = _company_id
        AND e.user_id = _user_id
        AND p.code = 'chat.send'
        AND p.is_active = true
    );
$$;

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;

CREATE POLICY "chat_messages_select"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (public.user_can_chat(auth.uid(), company_id));

CREATE POLICY "chat_messages_insert"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_user_id = auth.uid()
  AND public.user_can_send_chat(auth.uid(), company_id)
  AND (
    channel_type = 'general'
    OR (
      channel_type = 'direct'
      AND recipient_user_id IS NOT NULL
      AND public.user_can_chat(recipient_user_id, company_id)
    )
  )
);

GRANT EXECUTE ON FUNCTION public.user_can_chat(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_send_chat(UUID, UUID) TO authenticated;
