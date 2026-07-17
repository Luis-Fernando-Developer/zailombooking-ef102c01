// =============================================================================
// ENDPOINTS CATALOG (single source of truth)
// Dados puros — sem React/DOM — para permitir consumo por:
//  - página /api-docs (UI custom)
//  - página /api-docs/swagger (Swagger UI)
//  - script scripts/generate-openapi.ts (gera public/openapi.{json,yaml})
//  - edge function supabase/functions/openapi-spec (versão "live")
// =============================================================================

export type Param = {
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
    path: "/services/:id",
    title: "Detalhes do serviço",
    description: "Retorna os detalhes completos de um serviço.",
    params: [
      { name: "id", type: "uuid", location: "path", required: true, description: "ID do serviço" },
    ],
    responseExample: { id: "uuid", name: "Corte masculino", duration_minutes: 30, price: 50.0 },
  },
  {
    id: "service-employees",
    group: "Serviços",
    method: "GET",
    path: "/services/:id/employees",
    title: "Profissionais do serviço",
    description: "Lista profissionais habilitados a executar o serviço.",
    params: [
      { name: "id", type: "uuid", location: "path", required: true, description: "ID do serviço" },
    ],
    responseExample: [{ id: "uuid", name: "João" }],
  },

  // -------------------- Colaboradores --------------------
  {
    id: "list-employees",
    group: "Colaboradores",
    method: "GET",
    path: "/employees",
    title: "Listar colaboradores",
    description: "Lista colaboradores ativos. Filtre por serviço com `service_id`.",
    params: [
      { name: "service_id", type: "uuid", location: "query", description: "Filtra por serviço" },
    ],
    responseExample: [{ id: "uuid", name: "João", role: "Barbeiro" }],
  },
  {
    id: "employee-busy",
    group: "Colaboradores",
    method: "GET",
    path: "/employees/:id/busy",
    title: "Agenda ocupada",
    description: "Retorna os agendamentos ativos do colaborador num intervalo.",
    params: [
      { name: "id", type: "uuid", location: "path", required: true, description: "ID do colaborador" },
      { name: "from", type: "date", location: "query", required: true, description: "Data inicial (YYYY-MM-DD)" },
      { name: "to", type: "date", location: "query", required: true, description: "Data final (YYYY-MM-DD)" },
    ],
    responseExample: [{ id: "uuid", booking_date: "2026-07-10", start_time: "14:00", end_time: "14:30" }],
  },

  // -------------------- Disponibilidade --------------------
  {
    id: "availability-dates",
    group: "Disponibilidade (SSOT)",
    method: "GET",
    path: "/availability/dates",
    title: "Dias disponíveis",
    description:
      "Retorna todos os dias no intervalo que possuem ao menos 1 horário livre. Respeita escala, ausências, bloqueios e configurações da empresa.",
    params: [
      { name: "employee_id", type: "uuid", location: "query", required: true, description: "ID do colaborador" },
      { name: "service_id", type: "uuid", location: "query", required: true, description: "ID do serviço" },
      { name: "from", type: "date", location: "query", required: true, description: "Data inicial" },
      { name: "to", type: "date", location: "query", required: true, description: "Data final" },
    ],
    responseExample: ["2026-07-10", "2026-07-11", "2026-07-14"],
  },
  {
    id: "availability-slots",
    group: "Disponibilidade (SSOT)",
    method: "GET",
    path: "/availability/slots",
    title: "Horários disponíveis no dia",
    description: "Lista horários livres para um serviço/colaborador num dia específico.",
    params: [
      { name: "employee_id", type: "uuid", location: "query", required: true, description: "ID do colaborador" },
      { name: "service_id", type: "uuid", location: "query", required: true, description: "ID do serviço" },
      { name: "date", type: "date", location: "query", required: true, description: "Data (YYYY-MM-DD)" },
    ],
    responseExample: ["09:00", "09:30", "10:00", "14:30"],
  },
  {
    id: "availability-next",
    group: "Disponibilidade (SSOT)",
    method: "GET",
    path: "/availability/next",
    title: "Próximo horário livre",
    description: "Encontra o próximo horário livre dentro de 60 dias.",
    params: [
      { name: "employee_id", type: "uuid", location: "query", required: true, description: "ID do colaborador" },
      { name: "service_id", type: "uuid", location: "query", required: true, description: "ID do serviço" },
    ],
    responseExample: { date: "2026-07-10", time: "09:00" },
  },

  // -------------------- Clientes --------------------
  {
    id: "find-client",
    group: "Clientes",
    method: "GET",
    path: "/clients",
    title: "Buscar cliente por telefone",
    description: "Localiza um cliente pelo WhatsApp/telefone (E.164 ou nacional).",
    params: [
      { name: "phone", type: "string", location: "query", required: true, description: "Ex.: 5511999998888" },
    ],
    responseExample: { id: "uuid", name: "Maria", phone: "5511999998888" },
  },
  {
    id: "upsert-client",
    group: "Clientes",
    method: "POST",
    path: "/clients",
    title: "Criar/atualizar cliente",
    description: "Faz upsert por telefone. Ideal para o fluxo do WhatsApp.",
    params: [
      { name: "name", type: "string", location: "body", required: true, description: "Nome do cliente" },
      { name: "phone", type: "string", location: "body", required: true, description: "Telefone/WhatsApp" },
      { name: "email", type: "string", location: "body", description: "E-mail opcional" },
    ],
    bodyExample: { name: "Maria", phone: "5511999998888" },
    responseExample: { id: "uuid", name: "Maria", phone: "5511999998888" },
  },
  {
    id: "client-bookings",
    group: "Clientes",
    method: "GET",
    path: "/clients/:clientId/bookings",
    title: "Agendamentos do cliente",
    description: "Lista agendamentos passados/futuros do cliente.",
    params: [
      { name: "clientId", type: "uuid", location: "path", required: true, description: "ID do cliente" },
      { name: "scope", type: "enum", location: "query", description: "upcoming | past | all (default: all)" },
    ],
    responseExample: [{ id: "uuid", booking_date: "2026-07-10", start_time: "14:00", status: "confirmed" }],
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
      { name: "client_id", type: "uuid", location: "body", required: true, description: "ID do cliente" },
      { name: "service_id", type: "uuid", location: "body", required: true, description: "ID do serviço" },
      { name: "employee_id", type: "uuid", location: "body", required: true, description: "ID do colaborador" },
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
    path: "/bookings/:id",
    title: "Consultar agendamento",
    description: "Retorna os detalhes de um agendamento.",
    params: [{ name: "id", type: "uuid", location: "path", required: true, description: "ID do agendamento" }],
    responseExample: { id: "uuid", status: "confirmed" },
  },
  {
    id: "cancel-booking",
    group: "Agendamentos",
    method: "POST",
    path: "/bookings/:id/cancel",
    title: "Cancelar agendamento",
    description: "Cancela um agendamento (respeita regras de imutabilidade).",
    params: [
      { name: "id", type: "uuid", location: "path", required: true, description: "ID do agendamento" },
      { name: "reason", type: "string", location: "body", description: "Motivo opcional" },
    ],
    bodyExample: { reason: "Cliente solicitou via WhatsApp" },
    responseExample: { ok: true },
  },
  {
    id: "reschedule-booking",
    group: "Agendamentos",
    method: "POST",
    path: "/bookings/:id/reschedule",
    title: "Reagendar",
    description: "Reagenda usando `client_reschedule_booking` — mesma fonte da UI.",
    params: [
      { name: "id", type: "uuid", location: "path", required: true, description: "ID do agendamento" },
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
    description: "Gera cobrança para um agendamento (Pix / link de cartão).",
    params: [
      { name: "booking_id", type: "uuid", location: "body", required: true, description: "ID do agendamento" },
      { name: "method", type: "enum", location: "body", required: true, description: "pix | credit_card" },
    ],
    bodyExample: { booking_id: "uuid", method: "pix" },
    responseExample: { id: "uuid", qr_code: "00020126...", status: "pending" },
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
