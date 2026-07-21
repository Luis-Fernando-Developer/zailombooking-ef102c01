# whatsapp-integration

Edge function para gerenciar a integração WhatsApp (Evolution API) por empresa.

## Deploy manual (Supabase Dashboard)

1. Rode a migration `supabase/migrations_manual/2059_whatsapp_integration.sql`.
2. Crie a function `whatsapp-integration` no dashboard e cole `index.ts`.
3. Marque `verify_jwt = false` (a função valida o JWT em código via `getUser`).
4. Deploy.

## Ações (body JSON, sempre requer `company_id`)

| action                   | descrição                                                 |
| ------------------------ | --------------------------------------------------------- |
| `save`                   | salva Base URL + (opcional) Global API Key                |
| `disconnect`             | zera credenciais e remove instâncias                      |
| `set-channel-preference` | define rota de envio: auto, flow_only, direct_only, disabled |
| `list-instances-remote`  | consulta `/instance/fetchInstances` na Evolution          |
| `create-instance`        | cria instância nova via Global API Key                    |
| `register-instance`      | registra instância existente com apikey própria           |
| `delete-instance`        | remove instância local + tenta remover na Evolution       |
| `get-qrcode`             | retorna QR base64 (`/instance/connect/{name}`)            |
| `refresh-status`         | sincroniza status/número (todas ou uma)                   |
| `send-test`              | envia mensagem de teste                                   |
| `set-default-instance`   | marca instância como padrão                               |
| `list-templates`         | lista templates da empresa                                |
| `save-template`          | upsert de template por `event_key`                        |
| `delete-template`        | remove template                                           |

## Notas de segurança

- Nenhuma chave (`evolution_global_api_key`, `instance_api_key`) é retornada em respostas.
- Client lê apenas as views `whatsapp_integration_public` e `whatsapp_instances_public`.
- Todas ações validam pertencimento à empresa via `user_belongs_to_company`.

## Helper compartilhado

`supabase/functions/_shared/notify-whatsapp.ts` exporta `sendWhatsApp(supabase, companyId, to, msg)`
que resolve automaticamente Flow > Evolution conforme `resolve_whatsapp_channel(company_id)`.
Adicione às functions `notify-booking-change` / `marketing-notify` quando quiser roteamento real.
