// =============================================================================
// PUBLIC REST API — Zailom Booking (v1)
//
// URL base (produção): https://api-booking.zailom.com/v1/...
// Roteamento interno : https://<supabase>.functions.supabase.co/public-api/v1/...
//
// Autenticação:
//   Header: `Authorization: Bearer zlm_<key>` ou `x-api-key: zlm_<key>`
//   A key é resolvida via RPC `resolve_api_key(sha256)` para a company vinculada.
//
// Princípio arquitetural: esta função é APENAS um transporte HTTP.
// Toda regra de negócio (disponibilidade, escalas, conflitos, pagamentos,
// reagendamento) é executada pelas RPCs/tabelas EXISTENTES do Booking:
//   - get_available_slots  (SSOT de horários)
//   - is_slot_available    (gate único de escrita)
//   - list_available_dates (dias com pelo menos 1 slot)
//   - client_reschedule_booking
//   - notify-booking-change (edge function)
//
// NÃO duplicamos validações — apenas roteamos entrada/saída em JSON.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

// ─── util ────────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const err = (message: string, status = 400, extra?: Record<string, unknown>) =>
  json({ error: message, ...(extra ?? {}) }, status);

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePhone(raw: string): string {
  return String(raw ?? "").replace(/\D+/g, "");
}

function normalizeTime(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const iso = s.match(/T(\d{2}:\d{2})(?::\d{2})?/);
  if (iso?.[1]) return iso[1];
  const plain = s.match(/^(\d{2}:\d{2})(?::\d{2})?/);
  return plain?.[1] ?? null;
}

// ─── auth ────────────────────────────────────────────────────────────────────

interface ApiCtx {
  sb: SupabaseClient;
  companyId: string;
  scopes: string[];
}

async function authenticate(req: Request, sb: SupabaseClient): Promise<ApiCtx | Response> {
  const hdr = req.headers.get("authorization") ?? "";
  const raw =
    (hdr.toLowerCase().startsWith("bearer ") ? hdr.slice(7) : "") ||
    req.headers.get("x-api-key") ||
    "";
  if (!raw) return err("Missing API key. Provide `Authorization: Bearer <key>` or `x-api-key`.", 401);

  const hash = await sha256Hex(raw);
  const { data, error } = await sb.rpc("resolve_api_key", { p_hash: hash });
  if (error) return err("auth_error", 500, { detail: error.message });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.company_id) return err("Invalid or revoked API key.", 401);
  return { sb, companyId: row.company_id, scopes: row.scopes ?? ["read", "write"] };
}

function requireScope(ctx: ApiCtx, scope: "read" | "write"): Response | null {
  return ctx.scopes.includes(scope) ? null : err(`API key missing scope: ${scope}`, 403);
}

// ─── router ──────────────────────────────────────────────────────────────────
//
// Todos os handlers recebem (ctx, req, params) e retornam Response.
// Rotas são casadas por método + template com `:param`.

type Handler = (ctx: ApiCtx, req: Request, params: Record<string, string>) => Promise<Response>;
interface Route { method: string; pattern: string; handler: Handler; scope: "read" | "write" }

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) out[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return out;
}

// =============================================================================
// SERVIÇOS
// =============================================================================

const listServices: Handler = async (ctx) => {
  const { data, error } = await ctx.sb
    .from("services")
    .select("id, name, description, price, duration_minutes, is_active, image_url")
    .eq("company_id", ctx.companyId)
    .eq("is_active", true)
    .order("name");
  if (error) return err(error.message, 500);
  return json({ data });
};

const getService: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("services")
    .select("id, name, description, price, duration_minutes, is_active, image_url")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Service not found", 404);
  return json({ data });
};

const getServiceDuration: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("services")
    .select("duration_minutes")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Service not found", 404);
  return json({ duration_minutes: data.duration_minutes });
};

const getServicePrice: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("services")
    .select("price")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Service not found", 404);
  return json({ price: data.price });
};

const getServiceEmployees: Handler = async (ctx, _req, { id }) => {
  const { data: links, error: e1 } = await ctx.sb
    .from("employee_services")
    .select("employee_id")
    .eq("service_id", id);
  if (e1) return err(e1.message, 500);
  const ids = (links ?? []).map((r: any) => r.employee_id);
  if (!ids.length) return json({ data: [] });
  const { data, error } = await ctx.sb
    .from("employees")
    .select("id, name, avatar_url, role")
    .eq("company_id", ctx.companyId)
    .eq("is_active", true)
    .in("id", ids);
  if (error) return err(error.message, 500);
  return json({ data });
};

// =============================================================================
// COLABORADORES
// =============================================================================

const listEmployees: Handler = async (ctx, req) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("service_id");
  let q = ctx.sb
    .from("employees")
    .select("id, name, avatar_url, role, is_active")
    .eq("company_id", ctx.companyId)
    .eq("is_active", true);
  if (serviceId) {
    const { data: links } = await ctx.sb
      .from("employee_services")
      .select("employee_id")
      .eq("service_id", serviceId);
    const ids = (links ?? []).map((r: any) => r.employee_id);
    if (!ids.length) return json({ data: [] });
    q = q.in("id", ids);
  }
  const { data, error } = await q.order("name");
  if (error) return err(error.message, 500);
  return json({ data });
};

const getEmployee: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("employees")
    .select("id, name, avatar_url, role, is_active, employee_type")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Employee not found", 404);
  return json({ data });
};

// Agenda ocupada (bookings ativos) num intervalo
const getEmployeeBusy: Handler = async (ctx, req, { id }) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return err("Query params required: from, to (YYYY-MM-DD).", 400);
  const { data, error } = await ctx.sb
    .from("bookings")
    .select("id, booking_date, start_time, end_time, duration_minutes, service_id, booking_status")
    .eq("company_id", ctx.companyId)
    .eq("employee_id", id)
    .gte("booking_date", from)
    .lte("booking_date", to)
    .not("booking_status", "in", "(cancelled,canceled,rejected,no_show)")
    .order("booking_date")
    .order("start_time");
  if (error) return err(error.message, 500);
  return json({ data });
};

// =============================================================================
// DISPONIBILIDADE — 100% SSOT (RPCs existentes)
// =============================================================================

// Dias disponíveis num intervalo (default: próximos 30 dias).
const availabilityDates: Handler = async (ctx, req) => {
  const url = new URL(req.url);
  const employee_id = url.searchParams.get("employee_id");
  const service_id = url.searchParams.get("service_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!employee_id || !service_id) return err("employee_id and service_id are required", 400);

  const today = new Date();
  const fromD = from ?? today.toISOString().slice(0, 10);
  const toD = to ?? new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);

  const { data, error } = await ctx.sb.rpc("list_available_dates", {
    p_company: ctx.companyId,
    p_employee: employee_id,
    p_service: service_id,
    p_from: fromD,
    p_to: toD,
  });
  if (error) return err(error.message, 500);
  return json({ data: data ?? [] });
};

// Slots livres num dia (SSOT: get_available_slots).
const availabilitySlots: Handler = async (ctx, req) => {
  const url = new URL(req.url);
  const employee_id = url.searchParams.get("employee_id");
  const service_id = url.searchParams.get("service_id");
  const date = url.searchParams.get("date");
  if (!employee_id || !service_id || !date) return err("employee_id, service_id, date required", 400);
  const { data, error } = await ctx.sb.rpc("get_available_slots", {
    p_company: ctx.companyId,
    p_employee: employee_id,
    p_service: service_id,
    p_date: date,
  });
  if (error) return err(error.message, 500);
  const rows = (data ?? []) as Array<{ slot: string | null; reason: string | null }>;
  const slots = rows.filter((r) => r.slot).map((r) => String(r.slot).slice(0, 5));
  const reason = slots.length ? null : rows[0]?.reason ?? "no_slots";
  return json({ slots, reason });
};

// Próximo horário livre (varre até 60 dias).
const availabilityNext: Handler = async (ctx, req) => {
  const url = new URL(req.url);
  const employee_id = url.searchParams.get("employee_id");
  const service_id = url.searchParams.get("service_id");
  if (!employee_id || !service_id) return err("employee_id, service_id required", 400);
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 86400_000);
  const { data, error } = await ctx.sb.rpc("list_available_dates", {
    p_company: ctx.companyId,
    p_employee: employee_id,
    p_service: service_id,
    p_from: start.toISOString().slice(0, 10),
    p_to: end.toISOString().slice(0, 10),
  });
  if (error) return err(error.message, 500);
  const dates = ((data ?? []) as any[]).map((r) => r.date ?? r).filter(Boolean);
  for (const d of dates) {
    const day = typeof d === "string" ? d : new Date(d).toISOString().slice(0, 10);
    const { data: sd } = await ctx.sb.rpc("get_available_slots", {
      p_company: ctx.companyId,
      p_employee: employee_id,
      p_service: service_id,
      p_date: day,
    });
    const rows = (sd ?? []) as Array<{ slot: string | null }>;
    const slots = rows.filter((r) => r.slot).map((r) => String(r.slot).slice(0, 5));
    if (slots.length) return json({ date: day, time: slots[0] });
  }
  return json({ date: null, time: null, reason: "no_availability_in_window" });
};

// =============================================================================
// CLIENTES
// =============================================================================

const findClientByPhone: Handler = async (ctx, req) => {
  const url = new URL(req.url);
  const phone = normalizePhone(url.searchParams.get("phone") ?? "");
  if (!phone) return err("phone is required", 400);
  const { data, error } = await ctx.sb
    .from("clients")
    .select("id, name, email, phone, created_at")
    .eq("company_id", ctx.companyId)
    .ilike("phone", `%${phone}%`)
    .maybeSingle();
  if (error) return err(error.message, 500);
  return json({ data: data ?? null });
};

const upsertClient: Handler = async (ctx, req) => {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const phone = normalizePhone(body.phone ?? "");
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  if (!name || !phone) return err("name and phone are required", 400);

  const { data: existing } = await ctx.sb
    .from("clients")
    .select("id")
    .eq("company_id", ctx.companyId)
    .ilike("phone", `%${phone}%`)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await ctx.sb
      .from("clients")
      .update({ name, phone, ...(email ? { email } : {}) })
      .eq("id", existing.id)
      .select("id, name, email, phone")
      .single();
    if (error) return err(error.message, 500);
    return json({ data, created: false });
  }
  const { data, error } = await ctx.sb
    .from("clients")
    .insert({ company_id: ctx.companyId, name, phone, email })
    .select("id, name, email, phone")
    .single();
  if (error) return err(error.message, 500);
  return json({ data, created: true }, 201);
};

// =============================================================================
// AGENDAMENTOS — usam is_slot_available (gate único) + tabelas existentes
// =============================================================================

const createBooking: Handler = async (ctx, req) => {
  const b = await req.json().catch(() => ({}));
  const { client_id, service_id, employee_id, booking_date } = b;
  const start_time = normalizeTime(b.start_time ?? b.booking_time);
  if (!client_id || !service_id || !employee_id || !booking_date || !start_time)
    return err("client_id, service_id, employee_id, booking_date, start_time are required", 400);

  const { data: svc, error: svcErr } = await ctx.sb
    .from("services")
    .select("duration_minutes, price")
    .eq("company_id", ctx.companyId)
    .eq("id", service_id)
    .maybeSingle();
  if (svcErr || !svc) return err("Service not found", 404);

  const { data: ok, error: gErr } = await ctx.sb.rpc("is_slot_available", {
    p_company: ctx.companyId,
    p_employee: employee_id,
    p_service: service_id,
    p_date: booking_date,
    p_start: start_time,
    p_ignore_booking: null,
  });
  if (gErr) return err(gErr.message, 500);
  if (!ok) return err("slot_unavailable", 409, { reason: "conflict_or_schedule" });

  const { data, error } = await ctx.sb
    .from("bookings")
    .insert({
      company_id: ctx.companyId,
      client_id,
      service_id,
      employee_id,
      booking_date,
      start_time: `${booking_date}T${start_time}:00-03:00`,
      end_time: new Date(new Date(`${booking_date}T${start_time}:00-03:00`).getTime() + svc.duration_minutes * 60000).toISOString(),
      duration_minutes: svc.duration_minutes,
      price: b.price ?? svc.price,
      booking_status: b.booking_status ?? "confirmed",
      payment_status: b.payment_status ?? "pending",
      
    })
    .select()
    .single();
  if (error) return err(error.message, 500);
  return json({ data }, 201);
};

const getBooking: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("bookings")
    .select(`
      id, booking_date, start_time, end_time, duration_minutes, price,
      booking_status, payment_status, created_at,
      service:services(id, name, duration_minutes, price),
      employee:employees(id, name),
      client:clients(id, name, phone, email)
    `)
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Booking not found", 404);
  return json({ data });
};

const cancelBooking: Handler = async (ctx, req, { id }) => {
  const body = await req.json().catch(() => ({}));
  const { data, error } = await ctx.sb
    .from("bookings")
    .update({
      booking_status: "cancelled",
      cancellation_reason: body.reason ?? "cancelled_via_api",
    })
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .select()
    .single();
  if (error) return err(error.message, 500);
  return json({ data });
};

const confirmBooking: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("bookings")
    .update({ booking_status: "confirmed" })
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .select()
    .single();
  if (error) return err(error.message, 500);
  return json({ data });
};

// Reagendamento — usa RPC client_reschedule_booking (mesma lógica web).
const rescheduleBooking: Handler = async (ctx, req, { id }) => {
  const b = await req.json().catch(() => ({}));
  const new_date = b.new_date ?? b.booking_date;
  const new_time = normalizeTime(b.new_time ?? b.start_time);
  if (!new_date || !new_time) return err("new_date and new_time are required", 400);

  const { data, error } = await ctx.sb.rpc("client_reschedule_booking", {
    p_booking: id,
    p_new_date: new_date,
    p_new_time: new_time,
    p_new_employee: b.new_employee_id ?? null,
    p_new_service: b.new_service_id ?? null,
  });
  if (error) return err(error.message, 409, { reason: "reschedule_failed" });
  return json({ data });
};

const listBookingsForClient: Handler = async (ctx, req, { clientId }) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "all"; // upcoming | past | all
  let q = ctx.sb
    .from("bookings")
    .select(`
      id, booking_date, start_time, duration_minutes, price,
      booking_status, payment_status,
      service:services(id, name),
      employee:employees(id, name)
    `)
    .eq("company_id", ctx.companyId)
    .eq("client_id", clientId);
  const today = new Date().toISOString().slice(0, 10);
  if (scope === "upcoming") q = q.gte("booking_date", today).order("booking_date").order("start_time");
  else if (scope === "past") q = q.lt("booking_date", today).order("booking_date", { ascending: false });
  else q = q.order("booking_date", { ascending: false });
  const { data, error } = await q;
  if (error) return err(error.message, 500);
  return json({ data });
};

// =============================================================================
// PAGAMENTOS — reaproveita a edge `booking-create-payment` já existente.
// Aqui só padronizamos o contrato REST. Nada de regra local.
// =============================================================================

const listPaymentMethods: Handler = async (ctx) => {
  const { data, error } = await ctx.sb
    .from("company_payment_settings")
    .select("accepts_pix, accepts_credit_card, accepts_debit_card, accepts_cash, payout_flow")
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (error) return err(error.message, 500);
  const methods: string[] = [];
  if (data?.accepts_pix) methods.push("pix");
  if (data?.accepts_credit_card) methods.push("credit_card");
  if (data?.accepts_debit_card) methods.push("debit_card");
  if (data?.accepts_cash) methods.push("cash");
  return json({ methods, payout_flow: data?.payout_flow ?? "via_company" });
};

const createPayment: Handler = async (ctx, req) => {
  const body = await req.json().catch(() => ({}));
  const { data, error } = await ctx.sb.functions.invoke("booking-create-payment", {
    body: { ...body, company_id: ctx.companyId },
  });
  if (error) return err(error.message, 500);
  return json({ data });
};

const getPaymentStatus: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("booking_payments")
    .select("id, booking_id, status, method, amount, external_id, created_at, paid_at")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Payment not found", 404);
  return json({ data });
};

const confirmPayment: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("booking_payments")
    .update({ status: "confirmed", paid_at: new Date().toISOString() })
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .select()
    .single();
  if (error) return err(error.message, 500);
  return json({ data });
};

const cancelPayment: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("booking_payments")
    .update({ status: "cancelled" })
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .select()
    .single();
  if (error) return err(error.message, 500);
  return json({ data });
};

// =============================================================================
// NOTIFICAÇÕES / TEMPLATES — placeholders arquiteturais.
// Retornam estruturas estáveis e delegam para `notify-booking-change` quando
// aplicável. Canais WhatsApp/Email/Push serão plugados depois sem quebrar o
// contrato REST.
// =============================================================================

const sendNotification: Handler = async (ctx, req) => {
  const body = await req.json().catch(() => ({}));
  const { channel = "whatsapp", event, booking_id, payload } = body;
  if (!event) return err("event is required", 400);
  if (event.startsWith("booking.")) {
    const { data, error } = await ctx.sb.functions.invoke("notify-booking-change", {
      body: { company_id: ctx.companyId, booking_id, channel, event, payload },
    });
    if (error) return err(error.message, 500);
    return json({ data, dispatched: true });
  }
  // Outros canais/eventos: apenas registrar intenção (estrutura pronta).
  return json({
    dispatched: false,
    queued: true,
    channel,
    event,
    note: "channel not yet wired; contract stable",
  }, 202);
};

const TEMPLATE_KEYS = [
  "confirmation",
  "cancellation",
  "reschedule",
  "reminder",
  "post_service",
  "birthday",
  "inactive_client",
] as const;

const listTemplates: Handler = async (ctx) => {
  const { data } = await ctx.sb
    .from("notification_templates")
    .select("key, channel, subject, body, is_active")
    .eq("company_id", ctx.companyId);
  const rows = data ?? [];
  const byKey = new Map(rows.map((r: any) => [`${r.key}:${r.channel}`, r]));
  const catalog = TEMPLATE_KEYS.map((k) => ({
    key: k,
    variants: ["whatsapp", "email", "push"].map((ch) => ({
      channel: ch,
      configured: byKey.has(`${k}:${ch}`),
      template: byKey.get(`${k}:${ch}`) ?? null,
    })),
  }));
  return json({ data: catalog });
};

// =============================================================================
// ROUTING TABLE
// =============================================================================

const routes: Route[] = [
  // Health
  { method: "GET", pattern: "/v1/health", scope: "read",
    handler: async () => json({ ok: true, service: "public-api", version: "1.0.0" }) },

  // Services
  { method: "GET",  pattern: "/v1/services",                     scope: "read",  handler: listServices },
  { method: "GET",  pattern: "/v1/services/:id",                  scope: "read",  handler: getService },
  { method: "GET",  pattern: "/v1/services/:id/duration",         scope: "read",  handler: getServiceDuration },
  { method: "GET",  pattern: "/v1/services/:id/price",            scope: "read",  handler: getServicePrice },
  { method: "GET",  pattern: "/v1/services/:id/employees",        scope: "read",  handler: getServiceEmployees },

  // Employees
  { method: "GET",  pattern: "/v1/employees",                     scope: "read",  handler: listEmployees },
  { method: "GET",  pattern: "/v1/employees/:id",                 scope: "read",  handler: getEmployee },
  { method: "GET",  pattern: "/v1/employees/:id/busy",            scope: "read",  handler: getEmployeeBusy },

  // Availability (SSOT)
  { method: "GET",  pattern: "/v1/availability/dates",            scope: "read",  handler: availabilityDates },
  { method: "GET",  pattern: "/v1/availability/slots",            scope: "read",  handler: availabilitySlots },
  { method: "GET",  pattern: "/v1/availability/next",             scope: "read",  handler: availabilityNext },

  // Clients
  { method: "GET",  pattern: "/v1/clients",                       scope: "read",  handler: findClientByPhone },
  { method: "POST", pattern: "/v1/clients",                       scope: "write", handler: upsertClient },
  { method: "GET",  pattern: "/v1/clients/:clientId/bookings",    scope: "read",  handler: listBookingsForClient },

  // Bookings
  { method: "POST", pattern: "/v1/bookings",                      scope: "write", handler: createBooking },
  { method: "GET",  pattern: "/v1/bookings/:id",                  scope: "read",  handler: getBooking },
  { method: "POST", pattern: "/v1/bookings/:id/cancel",           scope: "write", handler: cancelBooking },
  { method: "POST", pattern: "/v1/bookings/:id/confirm",          scope: "write", handler: confirmBooking },
  { method: "POST", pattern: "/v1/bookings/:id/reschedule",       scope: "write", handler: rescheduleBooking },

  // Payments
  { method: "GET",  pattern: "/v1/payments/methods",              scope: "read",  handler: listPaymentMethods },
  { method: "POST", pattern: "/v1/payments",                      scope: "write", handler: createPayment },
  { method: "GET",  pattern: "/v1/payments/:id",                  scope: "read",  handler: getPaymentStatus },
  { method: "POST", pattern: "/v1/payments/:id/confirm",          scope: "write", handler: confirmPayment },
  { method: "POST", pattern: "/v1/payments/:id/cancel",           scope: "write", handler: cancelPayment },

  // Notifications & Templates (arquitetura preparada)
  { method: "POST", pattern: "/v1/notifications",                 scope: "write", handler: sendNotification },
  { method: "GET",  pattern: "/v1/templates",                     scope: "read",  handler: listTemplates },
];

// =============================================================================
// SERVE
// =============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // A URL entra como /functions/v1/public-api/v1/... ou (via custom domain)
  // como /v1/... — normalizamos ambos.
  const url = new URL(req.url);
  let path = url.pathname;
  const idx = path.indexOf("/public-api");
  if (idx >= 0) path = path.slice(idx + "/public-api".length);
  if (!path.startsWith("/v1")) path = "/v1" + (path.startsWith("/") ? path : "/" + path);

  // Health & root — sem auth para facilitar healthcheck externo.
  if (req.method === "GET" && (path === "/v1" || path === "/v1/" || path === "/v1/health")) {
    return json({ ok: true, service: "public-api", version: "1.0.0" });
  }

  const auth = await authenticate(req, sb);
  if (auth instanceof Response) return auth;

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const params = match(r.pattern, path);
    if (!params) continue;
    const scopeErr = requireScope(auth, r.scope);
    if (scopeErr) return scopeErr;
    try {
      return await r.handler(auth, req, params);
    } catch (e: any) {
      console.error("[public-api] handler error:", r.pattern, e);
      return err(e?.message ?? "internal_error", 500);
    }
  }
  return err(`Route not found: ${req.method} ${path}`, 404);
});
