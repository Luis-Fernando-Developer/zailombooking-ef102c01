# Zailom Booking — Public REST API (v1)

> Base URL (produção): **`https://api-booking.zailom.com/v1`**
> Base URL (Supabase direto): `https://<PROJECT>.functions.supabase.co/public-api/v1`

API oficial do Zailom Booking. **Nenhuma regra de negócio vive aqui** —
esta função apenas expõe, em HTTP/JSON, as RPCs e tabelas já existentes.

Consumidores previstos:
- **Zailom Flow** (WhatsApp, blocos HTTP Request)
- Aplicativos Mobile / Desktop
- Integrações de terceiros / parceiros
- Site público

---

## Autenticação

Toda requisição precisa de uma API Key vinculada a uma **empresa**.

```
Authorization: Bearer zlm_XXXXXXXXXXXXXXXX
```

ou

```
x-api-key: zlm_XXXXXXXXXXXXXXXX
```

Geração de chave (executar via SQL no painel Supabase, uma vez por empresa):

```sql
-- gere um valor forte, por ex: 'zlm_' || encode(gen_random_bytes(24),'hex')
insert into public.api_keys (company_id, name, key_prefix, key_hash, scopes)
values (
  '<COMPANY_UUID>',
  'Zailom Flow — produção',
  'zlm_abcd',                                    -- 8 primeiros chars visíveis
  encode(digest('zlm_abcd...restante_da_key','sha256'),'hex'),
  array['read','write']
);
```

Escopos:
- `read`  — leitura (GET)
- `write` — escrita (POST/PUT/PATCH/DELETE)

---

## Endpoints

### Serviços
| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/services` | Lista serviços ativos |
| GET | `/services/:id` | Detalhes do serviço |
| GET | `/services/:id/duration` | Duração em minutos |
| GET | `/services/:id/price` | Preço |
| GET | `/services/:id/employees` | Profissionais habilitados |

### Colaboradores
| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/employees?service_id=` | Lista (filtra por serviço) |
| GET | `/employees/:id` | Detalhes |
| GET | `/employees/:id/busy?from=&to=` | Agenda ocupada (bookings ativos) |

### Disponibilidade (SSOT — usa `get_available_slots` / `list_available_dates`)
| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/availability/dates?employee_id=&service_id=&from=&to=` | Dias com pelo menos 1 slot |
| GET | `/availability/slots?employee_id=&service_id=&date=` | Horários livres no dia |
| GET | `/availability/next?employee_id=&service_id=` | Próximo horário livre (até 60d) |

A disponibilidade respeita **automaticamente**: escala publicada, horários
da empresa, intervalos fixos/flex, bloqueios, ausências, férias,
realocações, agendamentos concorrentes e configurações da empresa.
A mesma lógica usada pela interface web.

### Clientes
| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/clients?phone=` | Busca por WhatsApp/telefone |
| POST | `/clients` | Cria ou atualiza (upsert por telefone) |
| GET | `/clients/:clientId/bookings?scope=upcoming\|past\|all` | Histórico / próximos |

### Agendamentos
| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/bookings` | Cria (passa pelo gate `is_slot_available`) |
| GET | `/bookings/:id` | Consulta |
| POST | `/bookings/:id/cancel` | Cancela |
| POST | `/bookings/:id/confirm` | Confirma |
| POST | `/bookings/:id/reschedule` | Reagenda (usa `client_reschedule_booking`) |

Payload de criação:
```json
{
  "client_id": "uuid",
  "service_id": "uuid",
  "employee_id": "uuid",
  "booking_date": "2026-07-15",
  "booking_time": "15:00"
}
```

Para integrações com bot/IA, **não envie `start_time` em ISO** (`2026-07-15T15:00:00Z`) e evite nomes genéricos como `data`, `date` e `time` quando puder. A fonte única deve ser:

- `booking_date`: data literal do agendamento em `YYYY-MM-DD`.
- `booking_time`: horário literal escolhido pelo cliente em `HH:mm`.

O endpoint deriva `start_time` internamente no fuso de negócio (`America/Sao_Paulo`).

### Pagamentos
| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/payments/methods` | Formas aceitas pela empresa |
| POST | `/payments` | Gera cobrança (Pix / link) — delega para `booking-create-payment` |
| GET | `/payments/:id` | Status |
| POST | `/payments/:id/confirm` | Confirma manualmente |
| POST | `/payments/:id/cancel` | Cancela |

### Notificações & Templates (estrutura pronta)
| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/notifications` | Solicita envio (WhatsApp/Email/Push). Eventos `booking.*` já disparam `notify-booking-change` |
| GET | `/templates` | Catálogo (confirmation, cancellation, reschedule, reminder, post_service, birthday, inactive_client) |

---

## Fluxo Zailom Flow → Booking

```
Cliente WhatsApp ──► Zailom Flow ──HTTP──► api-booking.zailom.com
                                              │
                                              ▼
                                    RPCs/tabelas do Booking
                                    (regras de negócio)
```

O Flow **nunca** valida disponibilidade, escalas ou conflitos.
Ele apenas coleta dados e chama a API. Toda decisão fica no Booking.

---

## Configuração do domínio

Aponte `api-booking.zailom.com` (via CDN/proxy) para o endpoint da
edge function `public-api`. Os handlers aceitam tanto `/v1/...` quanto
`/functions/v1/public-api/v1/...`, então qualquer reescrita funciona.

---

## Códigos de erro

- `400` — payload inválido
- `401` — API key ausente/inválida
- `403` — escopo insuficiente
- `404` — recurso ou rota não encontrada
- `409` — conflito (ex.: slot indisponível)
- `500` — erro interno / falha na RPC

Todas as respostas de erro seguem:
```json
{ "error": "mensagem", "reason": "opcional" }
```
