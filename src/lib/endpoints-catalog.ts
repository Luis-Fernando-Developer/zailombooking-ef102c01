// =============================================================================
// ENDPOINTS CATALOG (single source of truth)
// Dados puros — sem React/DOM — para permitir consumo por:
//  - página /api-docs (UI custom)
//  - página /api-docs/swagger (Swagger UI)
//  - script scripts/generate-openapi.ts (gera public/openapi.{json,yaml})
//  - edge function supabase/functions/openapi-spec (versão "live")
// =============================================================================

export type Param = {
  /** Stable, semantic name shared by API consumers and automation tools. */
  name: string;
  type: string;
  location: "path" | "query" | "body" | "header";
  required?: boolean;
  description: string;
  example?: string;
};

export type Endpoint = {
  id: string;
  group: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  title: string;
  description: string;
  params: Param[];
  bodyExample?: Record<string, unknown>;
  responseExample: unknown;
};

export const ENDPOINTS: Endpoint[] = [
  // -------------------- Serviços --------------------
  {
    id: "list-services",
    group: "Serviços",
    method: "GET",
    path: "/services",
    title: "Listar serviços",
    description: "Retorna todos os serviços ativos da empresa vinculada à API key.",
    params: [],
    responseExample: [
      { id: "uuid", name: "Corte masculino", duration_minutes: 30, price: 50.0 },
    ],
  },
  {
    id: "get-service",
    group: "Serviços",
    method: "GET",
    path: "/services/details/:service_id",
    title: "Detalhes do serviço",
    description: "Retorna os detalhes completos do serviço identificado por service_id no contexto da empresa vinculada à API key. Use o identificador retornado por GET /services; substitua {{service_id}} pelo valor real antes de enviar a requisição. Não use o nome do serviço como identificador.",
    params: [
      { name: "service_id", type: "uuid", location: "path", required: true, description: "Identificador do serviço", example: "123e4567-e89b-12d3-a456-426614174000" },
    ],
    responseExample: { id: "uuid", name: "Corte masculino", duration_minutes: 30, price: 50.0 },
  },
  {
    id: "service-employees",
    group: "Serviços",
    method: "GET",
    path: "/services/:service_id/employees",
    title: "Listar profissionais do serviço",
    description: "Lista os profissionais ativos habilitados a executar o serviço identificado por service_id. Substitua {{service_id}} pelo identificador real retornado por GET /services antes de enviar a requisição.",
    params: [
      { name: "service_id", type: "uuid", location: "path", required: true, description: "Identificador do serviço" },
    ],
    responseExample: [{ id: "uuid", name: "João" }],
  },

  // -------------------- Colaboradores --------------------
  {
    id: "list-employees",
    group: "Profissionais",
    method: "GET",
    path: "/employees",
    title: "Listar profissionais",
    description: "Lista colaboradores ativos. Filtre por serviço com `service_id`.",
    params: [
      { name: "service_id", type: "uuid", location: "query", description: "Filtra por serviço", example: "123e4567-e89b-12d3-a456-426614174000" },
    ],
    responseExample: [{ id: "uuid", name: "João", role: "Barbeiro" }],
  },
  {
    id: "employee-busy",
    group: "Profissionais",
    method: "GET",
    path: "/employees/:employee_id/interval",
    title: "Agenda ocupada por intervalo",
    description: "Retorna os agendamentos ativos do profissional identificado por employee_id no intervalo informado. Use date_init para a data inicial e date_end para a data final, ambas no formato YYYY-MM-DD. Substitua os placeholders pelos valores reais antes de enviar a requisição.",
    params: [
      { name: "employee_id", type: "uuid", location: "path", required: true, description: "Identificador do profissional retornado pela API" },
      { name: "date_init", type: "date", location: "query", required: true, description: "Data inicial do intervalo (YYYY-MM-DD)", example: "2026-10-05" },
      { name: "date_end", type: "date", location: "query", required: true, description: "Data final do intervalo (YYYY-MM-DD)", example: "2026-10-31" },
    ],
    responseExample: [{ id: "uuid", booking_date: "2026-07-10", start_time: "14:00", end_time: "14:30" }],
  },

  // -------------------- Disponibilidade --------------------
  {
    id: "availability-dates",
    group: "Disponibilidade",
    method: "GET",
    path: "/availability/dates",
    title: "Dias disponíveis",
    description:
      "Retorna os dias no intervalo que possuem ao menos um horário livre. Respeita escala, ausências, bloqueios e configurações da empresa. Informe employee_id, service_id, date_init e date_end; as datas usam YYYY-MM-DD.",
    params: [
      { name: "employee_id", type: "uuid", location: "query", required: true, description: "Identificador do profissional" },
      { name: "service_id", type: "uuid", location: "query", required: true, description: "Identificador do serviço" },
      { name: "date_init", type: "date", location: "query", required: true, description: "Data inicial do intervalo (YYYY-MM-DD)", example: "2026-10-05" },
      { name: "date_end", type: "date", location: "query", required: true, description: "Data final do intervalo (YYYY-MM-DD)", example: "2026-10-31" },
    ],
    responseExample: ["2026-07-10", "2026-07-11", "2026-07-14"],
  },
  {
    id: "availability-slots",
    group: "Disponibilidade",
    method: "GET",
    path: "/availability/slots",
    title: "Horários disponíveis no dia",
    description: "Lista os horários disponíveis para um profissional e serviço na data informada. A data deve usar YYYY-MM-DD.",
    params: [
      { name: "employee_id", type: "uuid", location: "query", required: true, description: "Identificador do profissional" },
      { name: "service_id", type: "uuid", location: "query", required: true, description: "Identificador do serviço" },
      { name: "date", type: "date", location: "query", required: true, description: "Data (YYYY-MM-DD)", example: "2026-10-05" },
    ],
    responseExample: ["09:00", "09:30", "10:00", "14:30"],
  },
  {
    id: "availability-next",
    group: "Disponibilidade",
    method: "GET",
    path: "/availability/next",
    title: "Próximo horário livre",
    description: "Encontra o próximo horário livre para o profissional e serviço informados, pesquisando uma janela de até 60 dias.",
    params: [
      { name: "employee_id", type: "uuid", location: "query", required: true, description: "Identificador do profissional" },
      { name: "service_id", type: "uuid", location: "query", required: true, description: "Identificador do serviço" },
    ],
    responseExample: { date: "2026-07-10", time: "09:00" },
  },

  // -------------------- Clientes --------------------
  {
    id: "find-client",
    group: "Clientes",
    method: "GET",
    path: "/clients",
    title: "Buscar cliente por telefone/WhatsApp",
    description: "Localiza um cliente pelo telefone/WhatsApp. Substitua {{phone}} pelo telefone do cliente; aceite os formatos E.164 ou nacional conforme a validação da API.",
    params: [
      { name: "phone", type: "string", location: "query", required: true, description: "Telefone/WhatsApp (E.164 ou nacional)", example: "5511999998888" },
    ],
    responseExample: { id: "uuid", name: "Maria", phone: "5511999998888" },
  },
  {
    id: "create-client",
    group: "Clientes",
    method: "POST",
    path: "/clients",
    title: "Criar cliente",
    description: "Cria um novo cliente. Se o telefone já estiver cadastrado, retorna conflito e não altera o cliente existente.",
    params: [
      { name: "name", type: "string", location: "body", required: true, description: "Nome do cliente" },
      { name: "phone", type: "string", location: "body", required: true, description: "Telefone/WhatsApp" },
      { name: "email", type: "string", location: "body", description: "E-mail opcional" },
    ],
    bodyExample: { name: "Maria", phone: "5511999998888" },
    responseExample: { id: "uuid", name: "Maria", phone: "5511999998888" },
  },
  {
    id: "update-client",
    group: "Clientes",
    method: "PATCH",
    path: "/clients/:client_id",
    title: "Atualizar cliente",
    description: "Atualiza o cliente identificado por client_id. Não cria cliente novo. Envie somente os campos que deseja alterar.",
    params: [
      { name: "client_id", type: "uuid", location: "path", required: true, description: "Identificador do cliente" },
      { name: "name", type: "string", location: "body", description: "Novo nome" },
      { name: "phone", type: "string", location: "body", description: "Novo telefone/WhatsApp" },
      { name: "email", type: "string", location: "body", description: "Novo e-mail; envie null para remover" },
    ],
    bodyExample: { name: "Maria Silva", phone: "5511999998888" },
    responseExample: { id: "uuid", name: "Maria Silva", phone: "5511999998888" },
  },
  {
    id: "client-bookings",
    group: "Clientes",
    method: "GET",
    path: "/clients/:client_id/bookings",
    title: "Agendamentos do cliente",
    description: "Lista agendamentos passados e/ou futuros do cliente identificado por client_id. O parâmetro scope aceita upcoming, past ou all.",
    params: [
      { name: "client_id", type: "uuid", location: "path", required: true, description: "Identificador do cliente" },
      { name: "scope", type: "enum", location: "query", description: "upcoming | past | all (default: all)", example: "upcoming" },
    ],
    responseExample: [{ id: "uuid", booking_date: "2026-07-10", start_time: "14:00", status: "confirmed" }],
  },

  // -------------------- Reservas temporárias --------------------
  {
    id: "create-booking-hold", group: "Reservas temporárias", method: "POST", path: "/booking-holds",
    title: "Criar reserva temporária",
    description: "Reserva temporariamente o horário escolhido antes do pagamento. O hold expira automaticamente se não for concluído.",
    params: [
      { name: "client_id", type: "uuid", location: "body", required: true, description: "Identificador do cliente" },
      { name: "service_id", type: "uuid", location: "body", required: true, description: "Identificador do serviço" },
      { name: "employee_id", type: "uuid", location: "body", required: true, description: "Identificador do profissional" },
      { name: "booking_date", type: "date", location: "body", required: true, description: "YYYY-MM-DD" },
      { name: "booking_time", type: "time", location: "body", required: true, description: "HH:mm" },
    ],
    bodyExample: { client_id: "uuid", service_id: "uuid", employee_id: "uuid", booking_date: "2026-10-05", booking_time: "15:00" },
    responseExample: { id: "hold_xxx", status: "active", expires_at: "2026-10-05T18:10:00.000Z", booking_date: "2026-10-05", booking_time: "15:00" },
  },
  {
    id: "get-booking-hold", group: "Reservas temporárias", method: "GET", path: "/booking-holds/:hold_id",
    title: "Consultar reserva temporária",
    description: "Consulta o estado da reserva temporária e identifica se ela ainda está ativa ou expirou.",
    params: [{ name: "hold_id", type: "uuid", location: "path", required: true, description: "Identificador da reserva temporária" }],
    responseExample: { id: "hold_xxx", status: "active", expires_at: "2026-10-05T18:10:00.000Z" },
  },
  {
    id: "cancel-booking-hold", group: "Reservas temporárias", method: "POST", path: "/booking-holds/:hold_id/cancel",
    title: "Cancelar reserva temporária", description: "Libera o horário reservado antes do pagamento ou conclusão do checkout.",
    params: [{ name: "hold_id", type: "uuid", location: "path", required: true, description: "Identificador da reserva temporária" }],
    responseExample: { ok: true, status: "cancelled" },
  },
  {
    id: "complete-booking-hold", group: "Reservas temporárias", method: "POST", path: "/booking-holds/:hold_id/complete",
    title: "Finalizar reserva temporária", description: "Conclui o checkout e transforma o hold em agendamento somente quando o pagamento informado está confirmado.",
    params: [
      { name: "hold_id", type: "uuid", location: "path", required: true, description: "Identificador da reserva temporária" },
      { name: "payment_id", type: "string", location: "body", required: true, description: "ID do pagamento confirmado" },
    ],
    bodyExample: { payment_id: "pay_xxx" },
    responseExample: { booking_id: "uuid", hold_id: "hold_xxx", payment_id: "pay_xxx", status: "confirmed" },
  },

  // -------------------- Agendamentos --------------------
  {
    id: "create-booking",
    group: "Agendamentos",
    method: "POST",
    path: "/bookings",
    title: "Criar agendamento",
    description:
      "Cria um agendamento. Para bots, envie sempre `booking_date` + `booking_time` como fonte única; evite campos genéricos como `data`, `date`, `time` e não envie `start_time` ISO.",
    params: [
      { name: "client_id", type: "uuid", location: "body", required: true, description: "Identificador do cliente" },
      { name: "service_id", type: "uuid", location: "body", required: true, description: "Identificador do serviço" },
      { name: "employee_id", type: "uuid", location: "body", required: true, description: "Identificador do profissional" },
      { name: "booking_date", type: "date", location: "body", required: true, description: "YYYY-MM-DD, ex.: 2026-07-15" },
      { name: "booking_time", type: "time", location: "body", required: true, description: "HH:mm, ex.: 15:00" },
    ],
    bodyExample: {
      client_id: "uuid",
      service_id: "uuid",
      employee_id: "uuid",
      booking_date: "2026-07-15",
      booking_time: "15:00",
    },
    responseExample: { id: "uuid", status: "confirmed" },
  },
  {
    id: "get-booking",
    group: "Agendamentos",
    method: "GET",
    path: "/bookings/:booking_id",
    title: "Consultar agendamento",
    description: "Retorna os detalhes do agendamento identificado por booking_id, dentro da empresa vinculada à API key.",
    params: [{ name: "booking_id", type: "uuid", location: "path", required: true, description: "Identificador do agendamento" }],
    responseExample: { id: "uuid", status: "confirmed" },
  },
  {
    id: "cancel-booking",
    group: "Agendamentos",
    method: "POST",
    path: "/bookings/:booking_id/cancel",
    title: "Cancelar agendamento",
    description: "Cancela um agendamento (respeita regras de imutabilidade).",
    params: [
      { name: "booking_id", type: "uuid", location: "path", required: true, description: "Identificador do agendamento" },
      { name: "reason", type: "string", location: "body", description: "Motivo opcional" },
    ],
    bodyExample: { reason: "Cliente solicitou via WhatsApp" },
    responseExample: { ok: true },
  },
  {
    id: "reschedule-booking",
    group: "Agendamentos",
    method: "POST",
    path: "/bookings/:booking_id/reschedule",
    title: "Reagendar",
    description: "Reagenda usando `client_reschedule_booking` — mesma fonte da UI.",
    params: [
      { name: "booking_id", type: "uuid", location: "path", required: true, description: "Identificador do agendamento" },
      { name: "new_date", type: "date", location: "body", required: true, description: "Nova data" },
      { name: "new_time", type: "time", location: "body", required: true, description: "Novo horário" },
    ],
    bodyExample: { new_date: "2026-07-11", new_time: "15:00" },
    responseExample: { ok: true },
  },

  // -------------------- Pagamentos --------------------
  {
    id: "payment-methods",
    group: "Pagamentos",
    method: "GET",
    path: "/payments/methods",
    title: "Formas de pagamento",
    description: "Retorna as formas aceitas pela empresa.",
    params: [],
    responseExample: ["pix", "credit_card", "cash"],
  },
  {
    id: "create-payment",
    group: "Pagamentos",
    method: "POST",
    path: "/payments",
    title: "Gerar cobrança",
    description: "Gera uma cobrança para um agendamento existente ou para uma reserva temporária do checkout online. Para checkout com hold, envie hold_id em vez de booking_id.",
    params: [
      { name: "booking_id", type: "uuid", location: "body", description: "ID do agendamento existente. Não envie junto com hold_id." },
      { name: "hold_id", type: "uuid", location: "body", description: "ID da reserva temporária criada por POST /booking-holds. Não envie junto com booking_id." },
      { name: "method", type: "enum", location: "body", required: true, description: "pix | credit_card" },
    ],
    bodyExample: { hold_id: "uuid", method: "pix" },
    responseExample: { id: "pay_xxx", method: "PIX", invoice_url: "https://sandbox.asaas.com/i/xxx", pix_qr_code: "data:image/png;base64,...", pix_payload: "00020126...", status: "pending" },
  },
  {
    id: "get-payment",
    group: "Pagamentos",
    method: "GET",
    path: "/payments/:payment_id",
    title: "Consultar pagamento",
    description: "Consulta o pagamento local e atualiza seu status com o gateway quando necessário. payment_id pode ser o ID interno do pagamento ou o ID da cobrança no gateway.",
    params: [
      { name: "payment_id", type: "string", location: "path", required: true, description: "ID do pagamento ou identificador da cobrança no gateway" },
    ],
    responseExample: { id: "pay_xxx", status: "pending", gateway_status: "PENDING", method: "PIX" },
  },

  // -------------------- Notificações --------------------
  {
    id: "send-notification",
    group: "Notificações",
    method: "POST",
    path: "/notifications",
    title: "Disparar notificação",
    description:
      "Solicita envio de notificação. Eventos `booking.*` disparam automaticamente `notify-booking-change`.",
    params: [
      { name: "event", type: "string", location: "body", required: true, description: "Ex.: booking.created" },
      { name: "booking_id", type: "uuid", location: "body", description: "Se evento de booking" },
    ],
    bodyExample: { event: "booking.created", booking_id: "uuid" },
    responseExample: { ok: true },
  },
];
