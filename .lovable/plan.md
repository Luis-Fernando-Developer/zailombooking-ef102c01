# Plano de Aprimoramento do Vínculo Multi-Empresa e Login Flexível

O sistema agora confirma tokens de vínculo com sucesso, mas o login na segunda empresa está falhando com erro 401/429 (Bad Request/Too Many Requests) no Supabase Auth. Isso ocorre porque o usuário tenta logar com uma senha que é válida para a empresa específica, mas diverge da senha global do Supabase Auth, gerando um conflito de segurança.

## Alterações propostas

### 🗄️ Supabase Engineer
- Criar migração `2089_bypass_auth_conflict_on_login.sql` para aprimorar a RPC `validate_client_password`.
- Se a senha contextual for válida, a RPC agora retornará um sinalizador indicando se um bypass de senha global é necessário (via Magic Link transparente ou OTP).

### 🎨 UI Architect
- Refatorar `src/pages/client/Login.tsx` para tratar especificamente o cenário de senha divergente.
- Se a RPC confirmar que a senha da empresa está correta, mas o login global falhar, o sistema oferecerá um "Login Rápido" via E-mail/WhatsApp para sincronizar a sessão sem expor a senha global.

### 🔌 API Integrator
- Atualizar a Edge Function `send-client-confirmation` para também atuar como um provedor de "Login OTP" para usuários já vinculados que esqueceram ou possuem senhas divergentes da conta global.

## Detalhes Técnicos
- Utilização de `signInWithOtp` no frontend quando a senha contextual for validada mas a global falhar.
- Ajuste na RPC para retornar o `user_id` apenas se a senha bater com o `password_hash` da tabela `clients`.
- Implementação de um fluxo de redirecionamento pós-login OTP que mantém o estado da empresa (`slug`).

---

### 📊 Relatório de Execução

**Padrão utilizado:** Identity Provider Contextual Sync

**Sub-agentes ativados:**
- 🗄️ **Supabase Engineer** — ✅ Agendado
- 🎨 **UI Architect** — ✅ Agendado
- 🔍 **Code Auditor** — ✅ Agendado
- 🔌 **API Integrator** — ✅ Agendado

**Resumo:** O plano visa resolver o bloqueio de login na segunda empresa permitindo que o sistema reconheça a senha específica da empresa e sincronize a sessão global do Supabase Auth de forma segura.
