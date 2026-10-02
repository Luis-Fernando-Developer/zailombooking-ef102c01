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
import { createClient as createSupabaseClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

// Fire-and-forget dispatch para notify-booking-event (WhatsApp).
function fireBookingNotification(bookingId: string, eventKey: string) {
  try {
    const base = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!base || !key || !bookingId) return;
    fetch(`${base}/functions/v1/notify-booking-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ booking_id: bookingId, event_key: eventKey }),
    }).catch((e) => console.error("[fireBookingNotification]", e?.message ?? e));
  } catch (e) { console.error("[fireBookingNotification]", e); }
}

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

function normalizeTime(v: string | number | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const loosePlain = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (loosePlain?.[1] && loosePlain?.[2]) {
    const hour = Number(loosePlain[1]);
    const minute = Number(loosePlain[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${loosePlain[2]}`;
    }
  }
  // Para entrada de API de agendamento, um datetime vindo de automação deve ser
  // tratado como relógio local informado no texto, não convertido pela timezone
  // do runtime. Ex.: "2026-07-15T08:00:00Z" representa 08:00 escolhido no bot.
  const iso = s.match(/T(\d{2}:\d{2})(?::\d{2})?/);
  if (iso?.[1]) return iso[1];
  const zonedIso = s.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/);
  if (zonedIso) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Sao_Paulo",
      }).format(d);
    }
  }
  const plain = s.match(/^(\d{2}:\d{2})(?::\d{2})?/);
  return plain?.[1] ?? null;
}

function normalizeDate(v: string | number | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const isoWithTime = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})T/);
  const isoDate = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const brDate = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  const m = isoWithTime ?? isoDate;
  const [, year, month, day] = m ?? [];
  const brYear = brDate?.[3]
    ? String(Number(brDate[3]) < 100 ? 2000 + Number(brDate[3]) : Number(brDate[3]))
    : null;
  const normalized = brDate
    ? { year: brYear, month: brDate[2].padStart(2, "0"), day: brDate[1].padStart(2, "0") }
    : year && month && day
      ? { year, month: month.padStart(2, "0"), day: day.padStart(2, "0") }
      : null;
  if (!normalized) return null;
  const date = new Date(Date.UTC(Number(normalized.year), Number(normalized.month) - 1, Number(normalized.day)));
  if (
    date.getUTCFullYear() !== Number(normalized.year) ||
    date.getUTCMonth() !== Number(normalized.month) - 1 ||
    date.getUTCDate() !== Number(normalized.day)
  ) {
    return null;
  }
  return `${normalized.year}-${normalized.month}-${normalized.day}`;
}

function firstObject(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function unwrapBookingBody(body: unknown): Record<string, unknown> {
  const root = firstObject(body) ?? {};
  const nested = firstObject(root.booking, root.agendamento, root.reservation, root.payload, root.data);
  if (!nested) return root;

  // Bots/HTTP tools often wrap the intended payload in `data`/`payload`, or keep
  // a stale previous API response there. Merge defensively: scalar root fields
  // override nested fields, but object wrappers never overwrite a nested
  // Portuguese `data: "YYYY-MM-DD"` field.
  const rootScalars = Object.fromEntries(
    Object.entries(root).filter(([, value]) => {
      return value === null || typeof value !== "object" || Array.isArray(value);
    }),
  );
  const merged = { ...nested, ...rootScalars };

  const rootDateKey = [
    "booking_date",
    "data",
    "data_agendamento",
    "appointment_date",
    "selected_date",
    "selectedDate",
    "date",
  ].find((key) => rootScalars[key] !== undefined && rootScalars[key] !== null && String(rootScalars[key]).trim() !== "");

  const rootTimeKey = [
    "booking_time",
    "horario_agendamento",
    "horario",
    "horário",
    "hora",
    "appointment_time",
    "selected_time",
    "selectedTime",
    "time",
    "slot",
  ].find((key) => rootScalars[key] !== undefined && rootScalars[key] !== null && String(rootScalars[key]).trim() !== "");

  if (rootDateKey) merged.booking_date = rootScalars[rootDateKey];
  if (rootTimeKey) merged.booking_time = rootScalars[rootTimeKey];

  return merged;
}

const BOOKING_DATE_KEYS = [
  "booking_date",
  "data",
  "data_agendamento",
  "appointment_date",
  "selected_date",
  "selectedDate",
  "date",
];

const BOOKING_TIME_KEYS = [
  "booking_time",
  "horario_agendamento",
  "horario",
  "horário",
  "hora",
  "appointment_time",
  "selected_time",
  "selectedTime",
  "time",
  "slot",
];

function getBookingClockTime(body: Record<string, unknown>): string | null {
  // Campos literais vindos do bot são a fonte de verdade. start_time é apenas
  // compatibilidade legada para "HH:mm" e não aceita timestamp ISO silencioso.
  for (const key of BOOKING_TIME_KEYS) {
    const normalizedLiteral = normalizeTime(body[key] as string | number | null | undefined);
    if (normalizedLiteral) return normalizedLiteral;
  }

  const legacyStartTime = body.start_time;
  if (legacyStartTime && !String(legacyStartTime).includes("T")) {
    return normalizeTime(legacyStartTime as string | number | null | undefined);
  }
  return null;
}

function getBookingDate(body: Record<string, unknown>): string | null {
  for (const key of BOOKING_DATE_KEYS) {
    const normalizedDate = normalizeDate(body[key] as string | number | null | undefined);
    if (normalizedDate) return normalizedDate;
  }
  return null;
}

function getExplicitBookingClockTime(body: Record<string, unknown>): string | null {
  for (const key of BOOKING_TIME_KEYS) {
    const normalizedTime = normalizeTime(body[key] as string | number | null | undefined);
    if (normalizedTime) return normalizedTime;
  }
  return null;
}

function validateBookingInputConsistency(body: Record<string, unknown>): string | null {
  const startTimeRaw = body.start_time;
  if (!startTimeRaw || !String(startTimeRaw).includes("T")) return null;

  const explicitDate = getBookingDate(body);
  const explicitTime = getExplicitBookingClockTime(body);
  const startDate = normalizeDate(startTimeRaw as string | number | null | undefined);
  const startClock = normalizeTime(startTimeRaw as string | number | null | undefined);

  if (!explicitDate || !explicitTime) {
    return "timestamp ISO em start_time não é aceito como fonte do agendamento. Envie booking_date/data e booking_time/horario explicitamente.";
  }

  if (explicitDate && startDate && explicitDate !== startDate) {
    return `booking_date (${explicitDate}) diverge de start_time (${startDate}). Envie booking_date + booking_time como fonte única, ou corrija start_time.`;
  }
  if (explicitTime && startClock && explicitTime !== startClock) {
    return `booking_time (${explicitTime}) diverge de start_time (${startClock}). Envie booking_date + booking_time como fonte única, ou corrija start_time.`;
  }
  return null;
}

function rowsContainSlot(
  rows: Array<{ slot: string | null; reason: string | null }> | null | undefined,
  startTime: string,
): { available: boolean; slots: string[]; reason: string | null } {
  const slots = (rows ?? [])
    .filter((row) => row.slot)
    .map((row) => String(row.slot).slice(0, 5));

  return {
    available: slots.includes(startTime),
    slots,
    reason: slots.length ? null : rows?.[0]?.reason ?? "no_slots",
  };
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
  const { data: services, error: servicesError } = await ctx.sb
    .from("services")
    .select("id, name, description, price, duration_minutes, is_active, image_url")
    .eq("company_id", ctx.companyId)
    .eq("is_active", true)
    .order("name");

  if (servicesError) return err(servicesError.message, 500);

  const { data: combos, error: combosError } = await ctx.sb
    .from("service_combos")
    .select("id, name, description, price, original_total_price, total_duration_minutes, is_active, image_url, items:service_combo_items(*)")
    .eq("company_id", ctx.companyId)
    .eq("is_active", true)
    .order("name");

  if (combosError) return err(combosError.message, 500);

  const serviceData = (services ?? []).map((service) => ({
    ...service,
    type: "service",
    service_type: "service",
  }));

  const comboData = (combos ?? []).map((combo: any) => ({
    id: `combo:${combo.id}`,
    combo_id: combo.id,
    name: combo.name,
    description: combo.description ?? null,
    price: combo.price ?? 0,
    original_total_price: combo.original_total_price ?? null,
    duration_minutes: combo.total_duration_minutes ?? 0,
    is_active: combo.is_active,
    image_url: combo.image_url ?? null,
    type: "combo",
    service_type: "combo",
    items: combo.items ?? [],
  }));

  return json({ data: [...serviceData, ...comboData] });
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
  const date = normalizeDate(url.searchParams.get("date"));
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

const createClient: Handler = async (ctx, req) => {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const phone = normalizePhone(body.phone ?? "");
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  if (!name || !phone) return err("name and phone are required", 400);

  const { data: existing, error: existingError } = await ctx.sb
    .from("clients")
    .select("id")
    .eq("company_id", ctx.companyId)
    .ilike("phone", phone)
    .maybeSingle();

  if (existingError) return err(existingError.message, 500);
  if (existing?.id) return err("Client already exists for this phone", 409, { client_id: existing.id });

  const { data, error } = await ctx.sb
    .from("clients")
    .insert({ company_id: ctx.companyId, name, phone, email })
    .select("id, name, email, phone")
    .single();
  if (error) return err(error.message, 500);
  return json({ data }, 201);
};

const updateClient: Handler = async (ctx, req, { clientId }) => {
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return err("name cannot be empty", 400);
    updates.name = name;
  }

  if (body.phone !== undefined) {
    const phone = normalizePhone(body.phone ?? "");
    if (!phone) return err("phone cannot be empty", 400);

    const { data: duplicate, error: duplicateError } = await ctx.sb
      .from("clients")
      .select("id")
      .eq("company_id", ctx.companyId)
      .ilike("phone", phone)
      .neq("id", clientId)
      .maybeSingle();

    if (duplicateError) return err(duplicateError.message, 500);
    if (duplicate?.id) return err("Another client already exists for this phone", 409, { client_id: duplicate.id });

    updates.phone = phone;
  }

  if (body.email !== undefined) {
    updates.email = body.email ? String(body.email).trim().toLowerCase() : null;
  }

  if (!Object.keys(updates).length) {
    return err("At least one field is required: name, phone, email", 400);
  }

  const { data, error } = await ctx.sb
    .from("clients")
    .update(updates)
    .eq("company_id", ctx.companyId)
    .eq("id", clientId)
    .select("id, name, email, phone")
    .maybeSingle();

  if (error) return err(error.message, 500);
  if (!data) return err("Client not found", 404);
  return json({ data });
};

// =============================================================================
// AGENDAMENTOS — usam is_slot_available (gate único) + tabelas existentes
// =============================================================================

const createBooking: Handler = async (ctx, req) => {
  const rawText = await req.text();
  let parsed: unknown = {};
  try { parsed = JSON.parse(rawText); } catch { /* ignore */ }
  console.log("[createBooking] raw_body:", rawText);
  const b = unwrapBookingBody(parsed);
  console.log("[createBooking] unwrapped_body:", JSON.stringify(b));
  const { client_id, service_id, employee_id } = b;
  const booking_date = getBookingDate(b);
  const booking_time = getBookingClockTime(b);
  console.log("[createBooking] resolved:", JSON.stringify({ client_id, service_id, employee_id, booking_date, booking_time }));
  const consistencyError = validateBookingInputConsistency(b);
  if (consistencyError) return err("inconsistent_booking_datetime", 400, { detail: consistencyError });
  if (!client_id || !service_id || !employee_id || !booking_date || !booking_time)
    return err("client_id, service_id, employee_id, booking_date/date (YYYY-MM-DD or DD/MM/YYYY), booking_time/time/horario (HH:mm) are required", 400);

  const { data: svc, error: svcErr } = await ctx.sb
    .from("services")
    .select("duration_minutes, price")
    .eq("company_id", ctx.companyId)
    .eq("id", service_id)
    .maybeSingle();
  if (svcErr || !svc) return err("Service not found", 404);

  const { data: availabilityRows, error: availabilityErr } = await ctx.sb.rpc("get_available_slots", {
    p_company: ctx.companyId,
    p_employee: employee_id,
    p_service: service_id,
    p_date: booking_date,
  });
  if (availabilityErr) return err(availabilityErr.message, 500);
  console.log("[createBooking] rpc_rows:", JSON.stringify(availabilityRows));

  const availability = rowsContainSlot(
    availabilityRows as Array<{ slot: string | null; reason: string | null }> | null,
    booking_time,
  );
  if (!availability.available) {
    console.log("[createBooking] slot_mismatch:", JSON.stringify({
      requested: booking_time,
      requested_len: booking_time?.length,
      requested_codes: booking_time ? [...booking_time].map((c) => c.charCodeAt(0)) : null,
      slots: availability.slots,
      slot_codes: availability.slots.map((s) => [...s].map((c) => c.charCodeAt(0))),
    }));
    return err("slot_unavailable", 409, {
      reason: availability.reason ?? "slot_not_returned_by_get_available_slots",
      available_slots: availability.slots,
      requested_time: booking_time,
      requested_date: booking_date,
      employee_id,
      service_id,
    });
  }

  const { data, error } = await ctx.sb
    .from("bookings")
    .insert({
      company_id: ctx.companyId,
      client_id,
      service_id,
      employee_id,
      booking_date,
      booking_time: `${booking_time}:00`,
      start_time: `${booking_date}T${booking_time}:00-03:00`,
      end_time: new Date(new Date(`${booking_date}T${booking_time}:00-03:00`).getTime() + svc.duration_minutes * 60000).toISOString(),
      duration_minutes: svc.duration_minutes,
      price: b.price ?? svc.price,
      booking_status: b.booking_status ?? "confirmed",
      payment_status: b.payment_status ?? "pending",
      
      
    })
    .select("*, service:services(id, name), employee:employees(id, name), client:clients(id, name, phone, email)")
    .single();
  if (error) return err(error.message, 500);
  fireBookingNotification(data.id, data.booking_status === "confirmed" ? "booking_confirmed" : "booking_pending");
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
  fireBookingNotification(id, "booking_cancelled");
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
  fireBookingNotification(id, "booking_confirmed");
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
  fireBookingNotification(id, "booking_rescheduled");
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
// RESERVAS TEMPORÁRIAS (CHECKOUT ONLINE)
// Usa a RPC canônica create_online_booking_hold. A API apenas normaliza
// entrada/saída e mantém o isolamento por company da API key.
// =============================================================================

const createBookingHold: Handler = async (ctx, req) => {
  const raw = await req.json().catch(() => ({}));
  const b = unwrapBookingBody(raw);

  const employee_id = String(b.employee_id ?? "").trim();
  const service_id = b.service_id ? String(b.service_id) : null;
  const client_id = String(b.client_id ?? "").trim();
  const booking_date = getBookingDate(b);
  const booking_time = getBookingClockTime(b);
  const hold_minutes = Number(b.hold_minutes ?? b.holdMinutes ?? 10);

  if (!employee_id || !client_id || !booking_date || !booking_time) {
    return err(
      "employee_id, client_id, booking_date/date (YYYY-MM-DD ou DD/MM/YYYY) e booking_time/time/horario (HH:mm) são obrigatórios",
      400,
    );
  }

  if (!Number.isInteger(hold_minutes) || hold_minutes < 1 || hold_minutes > 30) {
    return err("hold_minutes deve ser um inteiro entre 1 e 30", 400);
  }

  const { data: client, error: clientError } = await ctx.sb
    .from("clients")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("id", client_id)
    .maybeSingle();
  if (clientError) return err(clientError.message, 500);
  if (!client) return err("Client not found", 404);

  const { data: employee, error: employeeError } = await ctx.sb
    .from("employees")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("id", employee_id)
    .eq("is_active", true)
    .maybeSingle();
  if (employeeError) return err(employeeError.message, 500);
  if (!employee) return err("Employee not found", 404);

  if (service_id) {
    const { data: service, error: serviceError } = await ctx.sb
      .from("services")
      .select("id, duration_minutes")
      .eq("company_id", ctx.companyId)
      .eq("id", service_id)
      .maybeSingle();
    if (serviceError) return err(serviceError.message, 500);
    if (!service) return err("Service not found", 404);
  }

  const { data: serviceRow } = service_id
    ? await ctx.sb.from("services").select("duration_minutes").eq("company_id", ctx.companyId).eq("id", service_id).maybeSingle()
    : { data: null };

  const durationMinutes = Math.max(1, Number(serviceRow?.duration_minutes ?? b.duration_minutes ?? 60));
  const start_time = b.start_time && String(b.start_time).includes("T")
    ? String(b.start_time)
    : `${booking_date}T${booking_time}:00-03:00`;
  const end_time = b.end_time && String(b.end_time).includes("T")
    ? String(b.end_time)
    : new Date(new Date(start_time).getTime() + durationMinutes * 60000).toISOString();

  const { data, error } = await ctx.sb.rpc("create_online_booking_hold", {
    p_company_id: ctx.companyId,
    p_employee_id: employee_id,
    p_service_id: service_id,
    p_client_id: client_id,
    p_booking_date: booking_date,
    p_booking_time: `${booking_time}:00`,
    p_start_time: start_time,
    p_end_time: end_time,
    p_hold_minutes: hold_minutes,
  });

  if (error) {
    const message = error.message || "Não foi possível reservar o horário.";
    const status = error.details === "slot_already_held" || /acabou de ser reservado/i.test(message) ? 409 : 400;
    return err(message, status, {
      code: error.details === "slot_already_held" ? "slot_already_held" : "hold_creation_failed",
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.hold_id) return err("A API não recebeu o hold_id da reserva temporária.", 500);

  return json({
    data: {
      hold_id: row.hold_id,
      expires_at: row.expires_at,
      status: "active",
      booking_date,
      booking_time,
      employee_id,
      service_id,
      client_id,
    },
  }, 201);
};

const getBookingHold: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("booking_slot_holds")
    .select("id, company_id, employee_id, service_id, client_id, booking_date, booking_time, start_time, end_time, status, expires_at, created_at, updated_at")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Booking hold not found", 404);

  const expired = data.status === "active" && new Date(data.expires_at).getTime() <= Date.now();
  if (expired) {
    await ctx.sb.from("booking_slot_holds").update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("company_id", ctx.companyId).eq("id", id).eq("status", "active");
    return json({ data: { ...data, status: "expired" } });
  }

  return json({ data });
};

const cancelBookingHold: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("booking_slot_holds")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .eq("status", "active")
    .select("id, status, expires_at, updated_at")
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Active booking hold not found", 404);
  return json({ data });
};

const completeBookingHold: Handler = async (ctx, req, { id }) => {
  const body = await req.json().catch(() => ({}));
  const payment_id = String(body.payment_id ?? body.paymentId ?? "").trim();
  if (!payment_id) return err("payment_id is required", 400);

  const { data: hold, error: holdError } = await ctx.sb
    .from("booking_slot_holds")
    .select("id, company_id, status, expires_at")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (holdError) return err(holdError.message, 500);
  if (!hold) return err("Booking hold not found", 404);

  const { data: payment, error: paymentError } = await ctx.sb
    .from("booking_payments")
    .select("id, asaas_id, booking_id, company_id, status")
    .eq("company_id", ctx.companyId)
    .eq("asaas_id", payment_id)
    .maybeSingle();
  if (paymentError) return err(paymentError.message, 500);
  if (!payment) return err("Payment not found", 404);

  if (payment.booking_id) {
    const { data: booking } = await ctx.sb.from("bookings")
      .select("id, booking_date, start_time, end_time, booking_status, payment_status")
      .eq("company_id", ctx.companyId).eq("id", payment.booking_id).maybeSingle();
    return json({ data: { booking_id: payment.booking_id, payment_id, already_completed: true, booking } });
  }

  if (!["confirmed", "paid", "received"].includes(String(payment.status).toLowerCase())) {
    return err("Payment is not confirmed yet", 409, {
      code: "payment_not_confirmed",
      payment_status: payment.status,
      hold_status: hold.status,
      expires_at: hold.expires_at,
    });
  }

  const { data: bookingId, error } = await ctx.sb.rpc("confirm_online_booking_payment", {
    p_hold_id: id,
    p_payment_id: payment_id,
  });
  if (error) {
    const code = /tempo.*acabou|hold_expired/i.test(error.message) ? "hold_expired" : "booking_confirmation_failed";
    return err(error.message, code === "hold_expired" ? 409 : 400, { code });
  }

  const { data: booking } = await ctx.sb.from("bookings")
    .select("id, booking_date, start_time, end_time, duration_minutes, price, booking_status, payment_status, payment_method")
    .eq("company_id", ctx.companyId).eq("id", bookingId).maybeSingle();

  if (bookingId) {
    fireBookingNotification(String(bookingId), "payment_confirmed");
    fireBookingNotification(String(bookingId), "booking_confirmed");
  }

  return json({
    data: {
      booking_id: bookingId,
      payment_id,
      hold_id: id,
      booking,
    },
  }, 201);
};

// =============================================================================
// PAGAMENTOS — reaproveita a edge `booking-create-payment` já existente.
// Aqui só padronizamos o contrato REST. Nada de regra local.
// =============================================================================

const listPaymentMethods: Handler = async (ctx) => {
  const { data, error } = await ctx.sb
    .from("company_payment_settings")
    .select("payment_mode, accepted_methods, own_gateway_provider, payout_flow")
    .eq("company_id", ctx.companyId)
    .maybeSingle();

  if (error) return err(error.message, 500);

  const acceptedMethods =
    data?.accepted_methods &&
    typeof data.accepted_methods === "object" &&
    !Array.isArray(data.accepted_methods)
      ? data.accepted_methods as Record<string, unknown>
      : {};

  const methods = Object.entries(acceptedMethods)
    .filter(([, enabled]) => enabled === true)
    .map(([method]) => method);

  return json({
    payment_mode: data?.payment_mode ?? "none",
    provider: data?.own_gateway_provider ?? null,
    methods,
    payout_flow: data?.payout_flow ?? "via_company",
  });
};

const createPayment: Handler = async (ctx, req) => {
  const body = await req.json().catch(() => ({}));
  const { data, error } = await ctx.sb.functions.invoke("booking-create-payment", {
    body: { ...body, company_id: ctx.companyId },
  });

  if (error) {
    // Preserve the real Edge Function response instead of masking payment
    // failures as a generic HTTP 500 from public-api.
    let detail: Record<string, unknown> | null = null;
    let status = 500;

    try {
      const context = (error as any).context;
      if (context instanceof Response) {
        status = context.status || 500;
        const raw = await context.text();
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") detail = parsed;
          else if (raw) detail = { error: raw };
        } catch {
          if (raw) detail = { error: raw };
        }
      }
    } catch (readError) {
      console.error("[public-api] payment error detail read failed:", readError);
    }

    console.error("[public-api] booking-create-payment failed:", {
      message: error.message,
      status,
      detail,
    });

    return json({
      error: detail?.error ?? error.message ?? "payment_creation_failed",
      ...(detail ?? {}),
    }, status);
  }

  return json({ data });
};

const getPaymentStatus: Handler = async (ctx, _req, { id }) => {
  const { data, error } = await ctx.sb
    .from("booking_payments")
    .select("id, booking_id, company_id, status, method, amount, asaas_id, created_at, paid_at")
    .eq("company_id", ctx.companyId)
    .or(`id.eq.${id},asaas_id.eq.${id}`)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Payment not found", 404);

  const gatewayId = data.asaas_id ?? id;
  const { data: gateway, error: gatewayError } = await ctx.sb.functions.invoke("booking-payment-status", {
    body: { payment_id: gatewayId },
  });

  if (gatewayError) {
    return json({ data, gateway: null, gateway_error: gatewayError.message });
  }

  const { data: refreshed } = await ctx.sb
    .from("booking_payments")
    .select("id, booking_id, company_id, status, method, amount, asaas_id, created_at, paid_at")
    .eq("company_id", ctx.companyId)
    .eq("id", data.id)
    .maybeSingle();

  return json({
    data: refreshed ?? data,
    gateway: gateway ?? null,
  });
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

  const rawEvent = String(event).trim();
  const eventAliases: Record<string, string> = {
    "booking.created": "booking_created",
    "booking.pending": "booking_pending",
    "booking.confirmed": "booking_confirmed",
    "booking.cancelled": "booking_cancelled",
    "booking.completed": "booking_completed",
    "booking.no_show": "booking_no_show",
    "booking.rescheduled": "booking_rescheduled",
    "booking.reallocated": "booking_reallocated",
    "booking.reminder": "booking_reminder",
    "payment.confirmed": "payment_confirmed",
    "payment.pending": "payment_pending",
  };
  const eventKey = eventAliases[rawEvent] ?? rawEvent;

  const canonicalEvents = new Set([
    "booking_created",
    "booking_pending",
    "booking_confirmed",
    "booking_cancelled",
    "booking_completed",
    "booking_no_show",
    "booking_rescheduled",
    "booking_reallocated",
    "booking_reminder",
    "payment_confirmed",
    "payment_pending",
  ]);

  if (canonicalEvents.has(eventKey)) {
    if (!booking_id) return err("booking_id is required for this event", 400);

    const { data, error } = await ctx.sb.functions.invoke("notify-booking-event", {
      body: {
        booking_id,
        event_key: eventKey,
        channel,
        payload: payload ?? null,
      },
    });
    if (error) return err(error.message, 500);

    return json({
      data,
      dispatched: true,
      event: eventKey,
      booking_id,
    });
  }

  // Keep the existing change-notification contract for change-specific payloads.
  if (rawEvent.startsWith("booking.")) {
    const { data, error } = await ctx.sb.functions.invoke("notify-booking-change", {
      body: { company_id: ctx.companyId, booking_id, channel, event: rawEvent, payload },
    });
    if (error) return err(error.message, 500);
    return json({ data, dispatched: true, event: rawEvent, booking_id });
  }

  return err("Unsupported notification event: " + rawEvent, 400, {
    supported_events: Array.from(canonicalEvents),
  });
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
  { method: "POST",  pattern: "/v1/clients",                       scope: "write", handler: createClient },
  { method: "PATCH", pattern: "/v1/clients/:clientId",                  scope: "write", handler: updateClient },
  { method: "GET",  pattern: "/v1/clients/:clientId/bookings",    scope: "read",  handler: listBookingsForClient },

  // Booking holds — checkout online
  { method: "POST", pattern: "/v1/booking-holds",                scope: "write", handler: createBookingHold },
  { method: "GET",  pattern: "/v1/booking-holds/:id",             scope: "read",  handler: getBookingHold },
  { method: "POST", pattern: "/v1/booking-holds/:id/cancel",      scope: "write", handler: cancelBookingHold },
  { method: "POST", pattern: "/v1/booking-holds/:id/complete",    scope: "write", handler: completeBookingHold },

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

  const sb = createSupabaseClient(
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