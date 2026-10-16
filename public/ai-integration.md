# Guia de integração para IA — Zailom Booking API

Versão do guia: 1.0  
API base: `https://api-booking.zailom.com/v1`  
OpenAPI JSON: `https://booking.zailom.com/openapi.json`  
OpenAPI YAML: `https://booking.zailom.com/openapi.yaml`  
Descoberta OpenAPI: `https://booking.zailom.com/.well-known/openapi.json`

## Objetivo e autoridade

Este documento explica como um agente de IA deve interpretar e combinar as operações da API do Zailom Booking. Use-o em conjunto com a especificação OpenAPI, que define os métodos, caminhos, parâmetros, corpos e formatos de resposta.

A API do Booking é a fonte de verdade para dados e estados do sistema. Não declare uma reserva, pagamento ou agendamento concluído sem confirmar o resultado da operação correspondente.

## Regras globais obrigatórias

1. Todas as rotas abaixo são relativas à base `https://api-booking.zailom.com/v1`.
2. Toda requisição precisa de uma API key da empresa: `Authorization: Bearer <API_KEY>` ou `x-api-key: <API_KEY>`.
3. A chave limita o acesso à empresa à qual está vinculada. Não misture IDs de empresas diferentes.
4. Respeite os escopos da chave: leitura para consultas e escrita para operações que alteram dados.
5. Use os nomes oficiais das variáveis do contrato, como `service_id`, `employee_id`, `client_id`, `booking_id`, `hold_id` e `payment_id`. Em templates, represente valores dinâmicos como `{{service_id}}`. Substitua placeholders por valores reais antes de enviar a requisição.
6. Não use nomes de serviços, profissionais ou clientes como substitutos dos IDs quando o endpoint exigir um identificador.
7. Não invente rotas, parâmetros, estados, métodos de pagamento ou eventos. Se uma informação não estiver documentada ou disponível na resposta, consulte a documentação ou peça esclarecimento.
8. Verifique os parâmetros obrigatórios antes de chamar uma operação. Use os valores retornados por chamadas anteriores.
9. Trate erros HTTP como resultados reais. Em particular, `409` normalmente indica conflito ou indisponibilidade; não repita cegamente uma escrita.
10. Datas devem usar `YYYY-MM-DD`; horários de agendamento devem usar `HH:mm` no formato de 24 horas. Envie `booking_date` e `booking_time` explicitamente; não use `start_time` ISO como fonte principal de data/hora.
11. Antes de criar uma reserva ou agendamento, consulte a disponibilidade e revalide o horário imediatamente antes da escrita. A disponibilidade pode mudar.
12. Não execute duas operações de criação para a mesma intenção. Escolha o caminho adequado e reutilize IDs retornados pela API.

## Sequência recomendada para descobrir e selecionar um horário

1. Chame `GET /services` para apresentar o catálogo de serviços.
2. Quando o cliente selecionar um serviço, guarde o `service_id`. Use `GET /services/details/{{service_id}}` se precisar de preço, duração ou outros detalhes.
3. Consulte os profissionais com `GET /services/{{service_id}}/employees` ou, quando adequado, `GET /employees?service_id={{service_id}}`.
4. Com `employee_id` e `service_id`, consulte `GET /availability/dates?employee_id={{employee_id}}&service_id={{service_id}}&from={{date_init}}&to={{date_end}}`.
5. Para uma data selecionada, consulte `GET /availability/slots?employee_id={{employee_id}}&service_id={{service_id}}&date={{date}}`.
6. Apresente somente datas e horários retornados como disponíveis. Antes de gravar, reconsulte a disponibilidade.
7. Busque o cliente por telefone com `GET /clients?phone={{phone}}`. A resposta pode conter `data: null` quando não há cliente correspondente.
8. Se não houver cliente, solicite os dados necessários e chame `POST /clients`. Se o telefone já estiver cadastrado e a criação retornar `409`, use o `client_id` informado no erro ou faça uma nova busca; não crie repetidamente o mesmo cliente.
9. Atualize um cadastro existente somente quando necessário, usando `PATCH /clients/{{client_id}}` e enviando apenas os campos que devem mudar.

## Fluxo A — checkout com pagamento online e reserva temporária

Use este fluxo quando a modalidade escolhida exigir uma cobrança online e o processo de checkout precisar manter o horário temporariamente reservado.

1. Confirme que você tem `client_id`, `service_id`, `employee_id`, `booking_date` e `booking_time`.
2. Reconsulte `GET /availability/slots` para validar o horário.
3. Crie a reserva temporária com `POST /booking-holds`, enviando os IDs e as datas/horários obrigatórios. O campo opcional `hold_minutes` aceita um inteiro de 1 a 30; o padrão é 10 minutos.
4. Guarde o `hold_id` e o `expires_at` retornados. Se a criação falhar por conflito, não prossiga com o pagamento para aquele horário; volte a consultar a disponibilidade.
5. Consulte as formas configuradas pela empresa com `GET /payments/methods`. Use somente os métodos efetivamente retornados pela API.
6. Crie a cobrança com `POST /payments`, usando `hold_id` e o método aceito. Não envie `booking_id` junto com `hold_id`.
7. Apresente ao cliente as instruções de pagamento retornadas pela API, como QR Code ou código Pix, quando presentes.
8. Consulte `GET /payments/{{payment_id}}` para verificar o estado. Não trate `pending` como pagamento confirmado. A consulta pode atualizar o estado local a partir do gateway.
9. Somente quando a API indicar que o pagamento está confirmado, finalize a reserva com `POST /booking-holds/{{hold_id}}/complete`, enviando `payment_id` conforme o identificador esperado pelo endpoint.
10. A finalização é a operação que efetiva o agendamento associado ao checkout. Leia a resposta e guarde o `booking_id` retornado. Não chame também `POST /bookings` para a mesma intenção.
11. Se a finalização responder `409 payment_not_confirmed`, não tente contornar a validação: consulte o pagamento novamente e aguarde a confirmação.
12. Se a reserva expirar ou for cancelada, não presuma que o horário continua protegido. Consulte novamente a disponibilidade e inicie uma nova reserva se o cliente ainda quiser prosseguir.
13. Se o cliente desistir antes da conclusão, use `POST /booking-holds/{{hold_id}}/cancel` enquanto a reserva estiver ativa.

### Regra essencial do checkout

A sequência normal é:

`consultar disponibilidade → criar hold → criar cobrança → consultar pagamento → finalizar hold → obter booking_id`

Não execute `POST /bookings` depois de finalizar o hold: a finalização já efetiva o agendamento. A finalização exige pagamento confirmado e não deve ser usada para forçar a conclusão de um pagamento pendente.

## Fluxo B — criação direta de agendamento

`POST /bookings` cria um agendamento diretamente, sem usar o checkout de reserva temporária. É uma operação distinta do fluxo online.

Use a criação direta somente quando o cenário de negócio realmente não exigir o checkout com hold. Antes da chamada, valide os IDs e reconsulte a disponibilidade. Envie `client_id`, `service_id`, `employee_id`, `booking_date` e `booking_time`.

**Limitação importante do contrato publicado atualmente:** a operação documentada `POST /bookings` não expõe um campo oficial `payment_method` nem uma regra específica que represente o fluxo de pagamento no local. O comportamento atual da implementação usa `booking_status: confirmed` e `payment_status: pending` como valores padrão quando não são fornecidos. Portanto, não presuma que a escolha “pagar no local” esteja registrada como método de pagamento nem que o agendamento ficará aguardando aprovação manual. Não invente campos para contornar essa limitação.

Se o fluxo exigir que o Booking registre explicitamente pagamento no local ou mantenha o agendamento aguardando confirmação manual, esse comportamento precisa ser definido no contrato da API antes de instruir a IA a executá-lo.

### Regra contra duplicidade

Para uma única solicitação, escolha exatamente um caminho de criação:
- Checkout online: `POST /booking-holds` → cobrança → pagamento confirmado → finalizar hold.
- Criação direta: `POST /bookings`.

Nunca execute os dois caminhos para a mesma intenção de agendamento.

## Consultar, confirmar, cancelar ou reagendar

- `GET /bookings/{{booking_id}}`: consultar o agendamento e verificar os estados retornados.
- `POST /bookings/{{booking_id}}/confirm`: solicitar a confirmação de um agendamento existente. Use apenas quando a etapa de confirmação fizer sentido no estado atual.
- `POST /bookings/{{booking_id}}/cancel`: cancelar um agendamento existente; inclua um motivo quando disponível.
- `POST /bookings/{{booking_id}}/reschedule`: reagendar com `new_date` e `new_time`; consulte a disponibilidade antes de oferecer o novo horário.
- `GET /clients/{{client_id}}/bookings?scope=upcoming`: consultar agendamentos futuros do cliente; `scope` também pode ser `past` ou `all`.

Depois de qualquer operação de escrita, use a resposta real para informar o cliente. Se a operação falhar, não diga que foi concluída.

## Pagamentos: interpretação

- `GET /payments/methods` retorna a configuração de pagamentos da empresa, incluindo `payment_mode`, `methods`, `provider` e `payout_flow`. Não presuma que uma modalidade está habilitada sem verificar a resposta.
- `POST /payments` gera uma cobrança para um agendamento existente ou para uma reserva temporária. Para checkout com hold, envie `hold_id`; para cobrança associada a um agendamento existente, envie `booking_id`. Não envie os dois juntos.
- `GET /payments/{{payment_id}}` consulta o pagamento. Use o identificador devolvido pela operação de criação, conforme o contrato da resposta.
- `POST /payments/{{payment_id}}/confirm` é uma operação explícita de confirmação manual no contrato atual. Não a use como substituto da confirmação real do gateway ou para transformar um pagamento pendente em pago sem autorização e evidência.
- `POST /payments/{{payment_id}}/cancel` cancela um pagamento quando permitido.
- Estados de pagamento e de agendamento são distintos. Um pagamento pendente não significa pagamento confirmado; um agendamento criado não significa que o pagamento foi recebido.

## Notificações

- `GET /templates` retorna os modelos/eventos configurados para a empresa. Trate as chaves retornadas por essa operação como a fonte de verdade; não invente chaves de evento.
- `POST /notifications` solicita um disparo de notificação conforme o contrato da API.
- Algumas alterações de agendamento já disparam notificações automaticamente pelo backend. Não envie uma segunda notificação manual para o mesmo evento sem verificar se ela é necessária, para evitar mensagens duplicadas.
- O conjunto de eventos disponíveis pode variar conforme a implementação e a configuração da empresa. Consulte `GET /templates` antes de escolher um evento.

## Catálogo de endpoints

Os caminhos são relativos à base `https://api-booking.zailom.com/v1`. Use a especificação OpenAPI vinculada a esta documentação para conferir parâmetros, corpos, autenticação e exemplos de resposta.

### Serviços
- `GET /services` — listar serviços.
- `GET /services/details/{{service_id}}` — detalhes do serviço.
- `GET /services/{{service_id}}/duration` — duração do serviço.
- `GET /services/{{service_id}}/price` — preço do serviço.
- `GET /services/{{service_id}}/employees` — profissionais habilitados para o serviço.

### Profissionais
- `GET /employees` — listar profissionais; aceita `service_id` como filtro.
- `GET /employees/{{employee_id}}` — detalhes do profissional.
- `GET /employees/{{employee_id}}/interval?from={{date_init}}&to={{date_end}}` — agenda ocupada no intervalo.

### Disponibilidade
- `GET /availability/dates?employee_id={{employee_id}}&service_id={{service_id}}&from={{date_init}}&to={{date_end}}` — datas com horários livres.
- `GET /availability/slots?employee_id={{employee_id}}&service_id={{service_id}}&date={{date}}` — horários disponíveis em uma data.
- `GET /availability/next?employee_id={{employee_id}}&service_id={{service_id}}` — próximo horário livre.

### Clientes
- `GET /clients?phone={{phone}}` — buscar cliente por telefone.
- `POST /clients` — criar cliente.
- `PATCH /clients/{{client_id}}` — atualizar cliente.
- `GET /clients/{{client_id}}/bookings?scope=upcoming` — consultar agendamentos do cliente.

### Reservas temporárias
- `POST /booking-holds` — criar reserva temporária.
- `GET /booking-holds/{{hold_id}}` — consultar reserva temporária.
- `POST /booking-holds/{{hold_id}}/cancel` — cancelar reserva temporária.
- `POST /booking-holds/{{hold_id}}/complete` — finalizar checkout e efetivar o agendamento após pagamento confirmado.

### Agendamentos
- `POST /bookings` — criar agendamento diretamente.
- `GET /bookings/{{booking_id}}` — consultar agendamento.
- `POST /bookings/{{booking_id}}/cancel` — cancelar agendamento.
- `POST /bookings/{{booking_id}}/confirm` — confirmar agendamento.
- `POST /bookings/{{booking_id}}/reschedule` — reagendar.

### Pagamentos
- `GET /payments/methods` — consultar formas de pagamento configuradas.
- `POST /payments` — gerar cobrança.
- `GET /payments/{{payment_id}}` — consultar pagamento.
- `POST /payments/{{payment_id}}/confirm` — confirmação manual explícita.
- `POST /payments/{{payment_id}}/cancel` — cancelar pagamento.

### Notificações
- `GET /templates` — listar modelos de notificação.
- `POST /notifications` — solicitar envio de notificação.

## Respostas e erros

- `2xx`: a operação foi aceita/concluída conforme o corpo retornado; confira os dados e estados.
- `400`: entrada inválida ou parâmetro obrigatório ausente. Corrija os dados antes de tentar novamente.
- `401`: API key ausente ou inválida.
- `403`: a chave não possui o escopo necessário.
- `404`: recurso ou identificador não encontrado.
- `409`: conflito, horário indisponível, reserva expirada ou pagamento ainda não confirmado, conforme o corpo de erro. Leia `error`, `code`, `reason` e demais campos retornados.
- `5xx`: erro no servidor ou dependência. Não afirme sucesso; consulte o estado antes de repetir uma operação de escrita.

## Orientação final ao agente

Antes de cada chamada, responda internamente:
1. Qual é o objetivo atual do usuário?
2. Qual operação oficial atende esse objetivo?
3. Tenho todos os IDs e parâmetros obrigatórios?
4. A operação depende de uma etapa anterior ou de um estado confirmado?
5. Já executei uma operação de criação para esta mesma solicitação?
6. Qual resultado real devo verificar antes de avançar?

Execute somente a operação apropriada à etapa atual. Não escolha endpoints pela ordem em que aparecem na lista e não execute todos os endpoints configurados em sequência. Use as dependências, as respostas e as regras deste guia para determinar o próximo passo.
