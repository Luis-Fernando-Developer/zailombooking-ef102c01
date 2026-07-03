// =============================================================================
// PUBLIC API DOCS + PLAYGROUND
// Rota: /api-docs  (pública)
// Inspirado no visual da Evolution API. Estilo dark, sidebar com endpoints,
// painel central com descrição/params/body e painel direito com "Experimentar"
// (executa fetch real contra a Edge Function `public-api`).
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Play, Loader2, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Base URL da API — usa o custom domain quando publicado, senão a edge function
// ---------------------------------------------------------------------------
// URL amigável (Cloudflare Worker faz proxy para a Edge Function do Supabase).
const DEFAULT_BASE = "https://api-booking.zailom.com/v1";

// ---------------------------------------------------------------------------
// Catálogo de endpoints
// ---------------------------------------------------------------------------
type Param = {
  name: string;
  type: string;
  location: "path" | "query" | "body" | "header";
  required?: boolean;
  description: string;
  example?: string;
};

type Endpoint = {
  id: string;
  group: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;             // ex: /services/:id
  title: string;
  description: string;
  params: Param[];
  bodyExample?: Record<string, unknown>;
  responseExample: unknown;
};

const ENDPOINTS: Endpoint[] = [
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
      "Cria um agendamento. Passa pelo gate `is_slot_available` (SSOT) — mesma validação da UI web.",
    params: [
      { name: "client_id", type: "uuid", location: "body", required: true, description: "ID do cliente" },
      { name: "service_id", type: "uuid", location: "body", required: true, description: "ID do serviço" },
      { name: "employee_id", type: "uuid", location: "body", required: true, description: "ID do colaborador" },
      { name: "booking_date", type: "date", location: "body", required: true, description: "YYYY-MM-DD" },
      { name: "start_time", type: "time", location: "body", required: true, description: "HH:mm" },
    ],
    bodyExample: {
      client_id: "uuid",
      service_id: "uuid",
      employee_id: "uuid",
      booking_date: "2026-07-10",
      start_time: "14:30",
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

const GROUPS = Array.from(new Set(ENDPOINTS.map((e) => e.group)));

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
const METHOD_STYLES: Record<Endpoint["method"], string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  DELETE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function MethodBadge({ method }: { method: Endpoint["method"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${METHOD_STYLES[method]}`}
    >
      {method}
    </span>
  );
}

function buildUrl(endpoint: Endpoint, values: Record<string, string>, base: string) {
  let path = endpoint.path;
  for (const p of endpoint.params.filter((x) => x.location === "path")) {
    path = path.replace(`:${p.name}`, encodeURIComponent(values[p.name] || `:${p.name}`));
  }
  const query = endpoint.params
    .filter((x) => x.location === "query" && values[x.name])
    .map((x) => `${x.name}=${encodeURIComponent(values[x.name])}`)
    .join("&");
  return `${base}${path}${query ? `?${query}` : ""}`;
}

function buildBody(endpoint: Endpoint, values: Record<string, string>) {
  const bodyParams = endpoint.params.filter((x) => x.location === "body");
  if (bodyParams.length === 0) return undefined;
  const obj: Record<string, unknown> = {};
  for (const p of bodyParams) {
    if (values[p.name] !== undefined && values[p.name] !== "") obj[p.name] = values[p.name];
  }
  return obj;
}

function toCurl(endpoint: Endpoint, url: string, body: unknown, apiKey: string) {
  const lines = [`curl --request ${endpoint.method} \\`, `  --url '${url}' \\`];
  lines.push(`  --header 'Authorization: Bearer ${apiKey || "<SUA_API_KEY>"}' \\`);
  if (body) {
    lines.push(`  --header 'Content-Type: application/json' \\`);
    lines.push(`  --data '${JSON.stringify(body, null, 2)}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, "");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function ApiDocs() {
  const [selectedId, setSelectedId] = useState(ENDPOINTS[0].id);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem("zlm_api_key_docs") || "");
  const [baseUrl, setBaseUrl] = useState<string>(DEFAULT_BASE);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ status: number; body: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const endpoint = useMemo(
    () => ENDPOINTS.find((e) => e.id === selectedId) ?? ENDPOINTS[0],
    [selectedId],
  );

  const url = useMemo(() => buildUrl(endpoint, paramValues, baseUrl), [endpoint, paramValues, baseUrl]);
  const body = useMemo(() => buildBody(endpoint, paramValues), [endpoint, paramValues]);
  const curl = useMemo(() => toCurl(endpoint, url, body, apiKey), [endpoint, url, body, apiKey]);

  function saveApiKey(v: string) {
    setApiKey(v);
    localStorage.setItem("zlm_api_key_docs", v);
  }

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1200);
  }

  async function runRequest() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(url, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const txt = await res.text();
      let pretty = txt;
      try {
        pretty = JSON.stringify(JSON.parse(txt), null, 2);
      } catch {
        /* keep raw */
      }
      setResult({ status: res.status, body: pretty });
    } catch (err) {
      setResult({ status: 0, body: String(err) });
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    document.title = "Zailom Booking — API Reference";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">


      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary" />
            <span className="font-semibold">Zailom Booking</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">API Reference</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
              placeholder="Cole sua API key (zlm_...)"
              className="h-8 w-64 rounded-md border border-border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[260px_1fr_480px] gap-0">
        {/* Sidebar de endpoints */}
        <aside className="h-[calc(100vh-56px)] overflow-y-auto border-r border-border/60 bg-card/30 p-3">
          {GROUPS.map((g) => (
            <div key={g} className="mb-4">
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g}
              </div>
              <ul className="space-y-0.5">
                {ENDPOINTS.filter((e) => e.group === g).map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => {
                        setSelectedId(e.id);
                        setParamValues({});
                        setResult(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                        selectedId === e.id
                          ? "bg-primary/15 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <MethodBadge method={e.method} />
                      <span className="truncate">{e.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* Painel central */}
        <main className="h-[calc(100vh-56px)] overflow-y-auto p-8">
          <div className="text-sm text-primary">{endpoint.group}</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{endpoint.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{endpoint.description}</p>

          {/* URL bar */}
          <div className="mt-6 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm">
            <MethodBadge method={endpoint.method} />
            <code className="flex-1 truncate font-mono text-xs text-muted-foreground">{url}</code>
            <button
              onClick={runRequest}
              disabled={running || !apiKey}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Experimentar
            </button>
          </div>
          {!apiKey && (
            <p className="mt-2 text-xs text-amber-500">
              Cole sua API key no topo da página para habilitar o "Experimentar".
            </p>
          )}

          {/* Autorização */}
          <Section title="Autorizações">
            <ParamRow name="Authorization" type="string" location="header" required description="Bearer zlm_..." />
          </Section>

          {/* Path params */}
          {endpoint.params.some((p) => p.location === "path") && (
            <Section title="Parâmetros de caminho">
              {endpoint.params
                .filter((p) => p.location === "path")
                .map((p) => (
                  <EditableParam
                    key={p.name}
                    param={p}
                    value={paramValues[p.name] || ""}
                    onChange={(v) => setParamValues((s) => ({ ...s, [p.name]: v }))}
                  />
                ))}
            </Section>
          )}

          {/* Query params */}
          {endpoint.params.some((p) => p.location === "query") && (
            <Section title="Query params">
              {endpoint.params
                .filter((p) => p.location === "query")
                .map((p) => (
                  <EditableParam
                    key={p.name}
                    param={p}
                    value={paramValues[p.name] || ""}
                    onChange={(v) => setParamValues((s) => ({ ...s, [p.name]: v }))}
                  />
                ))}
            </Section>
          )}

          {/* Body */}
          {endpoint.params.some((p) => p.location === "body") && (
            <Section title="Body (application/json)">
              {endpoint.params
                .filter((p) => p.location === "body")
                .map((p) => (
                  <EditableParam
                    key={p.name}
                    param={p}
                    value={paramValues[p.name] || ""}
                    onChange={(v) => setParamValues((s) => ({ ...s, [p.name]: v }))}
                  />
                ))}
            </Section>
          )}

          <Section title="Base URL">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
            />
          </Section>
        </main>

        {/* Painel direito — cURL + resposta */}
        <aside className="h-[calc(100vh-56px)] overflow-y-auto border-l border-border/60 bg-card/30 p-4">
          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold text-muted-foreground">{endpoint.title}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">cURL</span>
                <button
                  onClick={() => copy(curl, "curl")}
                  className="rounded p-1 hover:bg-muted"
                  aria-label="Copiar cURL"
                >
                  {copied === "curl" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
            <pre className="max-h-64 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
              <code>{curl}</code>
            </pre>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background">
            <div className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs">
              {[200, 400, 401, 403, 404, 500].map((s) => (
                <span
                  key={s}
                  className={`${
                    result?.status === s
                      ? s < 300
                        ? "text-emerald-400"
                        : "text-rose-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {s}
                </span>
              ))}
              {result && (
                <span className="ml-auto text-muted-foreground">
                  status: <b className={result.status < 300 ? "text-emerald-400" : "text-rose-400"}>{result.status}</b>
                </span>
              )}
            </div>
            <pre className="max-h-[50vh] overflow-auto p-3 font-mono text-[11px] leading-relaxed">
              <code>
                {result
                  ? result.body
                  : JSON.stringify(endpoint.responseExample, null, 2)}
              </code>
            </pre>
          </div>

          <div className="mt-4 text-[11px] text-muted-foreground">
            <ChevronRight className="mr-1 inline h-3 w-3" />
            Dica: a API key fica salva localmente neste navegador.
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ParamRow({
  name,
  type,
  location,
  required,
  description,
}: {
  name: string;
  type: string;
  location: string;
  required?: boolean;
  description: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <code className="font-mono text-primary">{name}</code>
        <span className="text-muted-foreground">{type}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
          {location}
        </span>
        {required && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-400">obrigatório</span>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function EditableParam({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <code className="font-mono text-primary">{param.name}</code>
        <span className="text-muted-foreground">{param.type}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
          {param.location}
        </span>
        {param.required && (
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-400">obrigatório</span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{param.description}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.example || `Digite ${param.name}...`}
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
