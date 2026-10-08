-- 2219: impede a confirmação antiga de liberar acesso sem criação da senha.
REVOKE ALL ON FUNCTION public.confirm_owner_company_link(UUID) FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
