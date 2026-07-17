// =============================================================================
// PUBLIC API DOCS + PLAYGROUND
// Rota: /api-docs  (pública)
// Inspirado no visual da Evolution API. Estilo dark, sidebar com endpoints,
// painel central com descrição/params/body e painel direito com "Experimentar"
// (executa fetch real contra a Edge Function `public-api`).
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Play, Loader2, ChevronRight, BookOpen, Code2, Download, FileJson, FileCode2, ExternalLink } from "lucide-react";
import { NavLink, useLocation, useNavigate, Navigate } from "react-router-dom";
import { buildOpenApiSpec, specToJson, specToYaml, downloadBlob } from "@/lib/openapi-spec";

// ---------------------------------------------------------------------------
// Base URL da API — usa o custom domain quando publicado, senão a edge function
// ---------------------------------------------------------------------------
// URL oficial da API (proxy Traefik + nginx -> Supabase Edge Function).
const DEFAULT_BASE = "https://api-booking.zailom.com/v1";

// ---------------------------------------------------------------------------
// Catálogo de endpoints (fonte única em src/lib/endpoints-catalog.ts)
// ---------------------------------------------------------------------------
import { ENDPOINTS, type Endpoint, type Param } from "@/lib/endpoints-catalog";
export { ENDPOINTS };
export type { Endpoint, Param };

const GROUPS = Array.from(new Set(ENDPOINTS.map((e) => e.group)));

// Slug used in the URL for an endpoint. Ex.: "/services/:id" -> "v1/services/:id"
function endpointSlug(e: Endpoint) {
  return `v1${e.path}`;
}
function findEndpointBySlug(slug: string): Endpoint | undefined {
  const norm = slug.replace(/^\/+|\/+$/g, "");
  return ENDPOINTS.find((e) => endpointSlug(e) === norm);
}

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
// Response example generator — provides realistic per-status payloads
// ---------------------------------------------------------------------------
const STATUS_META: Record<number, { label: string; tone: "success" | "error" }> = {
  200: { label: "Sucesso", tone: "success" },
  400: { label: "Requisição inválida", tone: "error" },
  401: { label: "Não autenticado", tone: "error" },
  403: { label: "Sem permissão", tone: "error" },
  404: { label: "Não encontrado", tone: "error" },
  409: { label: "Conflito", tone: "error" },
  500: { label: "Erro do servidor", tone: "error" },
};

const STATUS_LIST = [200, 400, 401, 403, 404, 409, 500] as const;

function exampleForStatus(endpoint: Endpoint, status: number): unknown {
  if (status === 200) return endpoint.responseExample;
  switch (status) {
    case 400:
      return {
        error: "invalid_request",
        message: "Payload inválido ou parâmetros faltando.",
        details: { field: "booking_time", reason: "formato esperado HH:mm" },
      };
    case 401:
      return { error: "unauthorized", message: "API key ausente ou inválida." };
    case 403:
      return {
        error: "forbidden",
        message: "API key não possui o escopo necessário para esta operação.",
      };
    case 404:
      return { error: "not_found", message: "Recurso não encontrado." };
    case 409:
      return {
        error: "slot_unavailable",
        message: "O horário selecionado não está mais disponível.",
        reason: "slot_not_returned_by_get_available_slots",
      };
    case 500:
      return { error: "internal_error", message: "Erro inesperado. Tente novamente." };
    default:
      return { error: "unknown" };
  }
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function ApiDocs() {
  const location = useLocation();
  const navigate = useNavigate();

  // Route mode: intro | endpoint list (no selection) | endpoint detail | root(redirect)
  const path = location.pathname;
  const isRoot = path === "/api-docs" || path === "/api-docs/" || path === "/api-reference";
  const isIntro = path.startsWith("/api-docs/introduction");
  const isEndpointsTab = path.startsWith("/api-docs/endpoint");
  const rawEndpointPart = path.startsWith("/api-docs/endpoint/")
    ? path.slice("/api-docs/endpoint/".length).replace(/\/+$/, "")
    : "";
  const hasEndpointSelected = rawEndpointPart !== "" && rawEndpointPart !== "v1";
  const endpointFromUrl = hasEndpointSelected ? findEndpointBySlug(rawEndpointPart) : undefined;

  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem("zlm_api_key_docs") || "");
  const [baseUrl, setBaseUrl] = useState<string>(DEFAULT_BASE);
  const [paramsByEndpoint, setParamsByEndpoint] = useState<Record<string, Record<string, string>>>({});
  const selectedId = endpointFromUrl?.id ?? null;
  const paramValues = (selectedId && paramsByEndpoint[selectedId]) || {};
  const setParamValues = (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    if (!selectedId) return;
    setParamsByEndpoint((prev) => {
      const current = prev[selectedId] ?? {};
      const next = typeof updater === "function" ? (updater as (p: Record<string, string>) => Record<string, string>)(current) : updater;
      return { ...prev, [selectedId]: next };
    });
  };
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ status: number; body: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<number>(200);

  const endpoint = useMemo(
    () => (selectedId ? ENDPOINTS.find((e) => e.id === selectedId) : undefined),
    [selectedId],
  );

  const url = useMemo(() => (endpoint ? buildUrl(endpoint, paramValues, baseUrl) : ""), [endpoint, paramValues, baseUrl]);
  const body = useMemo(() => (endpoint ? buildBody(endpoint, paramValues) : undefined), [endpoint, paramValues]);
  const curl = useMemo(() => (endpoint ? toCurl(endpoint, url, body, apiKey) : ""), [endpoint, url, body, apiKey]);

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
    if (!endpoint) return;
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
      if (STATUS_LIST.includes(res.status as (typeof STATUS_LIST)[number])) {
        setSelectedStatus(res.status);
      }
    } catch (err) {
      setResult({ status: 0, body: String(err) });
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    document.title = isIntro
      ? "Zailom Booking — API Introduction"
      : "Zailom Booking — API Reference";
  }, [isIntro]);

  // /api-docs → /api-docs/introduction
  if (isRoot) return <Navigate to="/api-docs/introduction" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">


      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4">
          <NavLink to="/api-docs/introduction" className="flex items-center gap-2">
            <img src="/logo_zylo.svg" alt="Zailom" className="h-7 w-7 object-contain" />
            <img
              src="/brand_name_zailom_booking.svg"
              alt="Zailom Booking"
              className="h-5 object-contain"
            />
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">API Reference</span>
          </NavLink>

          <nav className="ml-6 flex items-center gap-1 text-sm">
            <NavLink
              to="/api-docs/introduction"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                  isActive
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`
              }
            >
              <BookOpen className="h-3.5 w-3.5" />
              Introduction
            </NavLink>
            <NavLink
              to="/api-docs/endpoint/v1"
              className={() =>
                `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                  isEndpointsTab
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`
              }
            >
              <Code2 className="h-3.5 w-3.5" />
              Endpoints
            </NavLink>
          </nav>

          <NavLink
            to="/api-docs/swagger"
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
                isActive
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`
            }
          >
            <FileCode2 className="h-3.5 w-3.5" />
            Swagger UI
          </NavLink>

          <div className="ml-auto flex items-center gap-2">
            <OpenApiExportMenu />
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

      {isIntro ? (
        <IntroductionView />
      ) : (
        <>


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
                    <NavLink
                      to={`/api-docs/endpoint/${endpointSlug(e)}`}
                      onClick={() => setResult(null)}
                      className={({ isActive }) =>
                        `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                          isActive
                            ? "bg-primary/15 text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`
                      }
                    >
                      <MethodBadge method={e.method} />
                      <span className="truncate">{e.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {endpoint ? (
          <>
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

        {/* Painel direito — cURL + Request + Response */}
        <aside className="h-[calc(100vh-56px)] overflow-y-auto border-l border-border/60 bg-card/30 p-4 space-y-4">
          {/* cURL */}
          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <MethodBadge method={endpoint.method} />
                <span className="text-xs font-semibold text-muted-foreground">cURL</span>
              </div>
              <button
                onClick={() => copy(curl, "curl")}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Copiar cURL"
              >
                {copied === "curl" ? (
                  <><Check className="h-3 w-3 text-emerald-400" /> copiado</>
                ) : (
                  <><Copy className="h-3 w-3" /> copiar</>
                )}
              </button>
            </div>
            <pre className="max-h-56 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
              <code>{curl}</code>
            </pre>
          </div>

          {/* Request body */}
          {endpoint.bodyExample && (
            <div className="rounded-lg border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">Corpo da requisição</span>
                  <span className="text-[10px] text-muted-foreground">application/json — exemplo enviado no body</span>
                </div>
                <button
                  onClick={() => copy(JSON.stringify(endpoint.bodyExample, null, 2), "req")}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Copiar corpo"
                >
                  {copied === "req" ? (
                    <><Check className="h-3 w-3 text-emerald-400" /> copiado</>
                  ) : (
                    <><Copy className="h-3 w-3" /> copiar</>
                  )}
                </button>
              </div>
              <pre className="max-h-56 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
                <code>{JSON.stringify(endpoint.bodyExample, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Response */}
          <div className="rounded-lg border border-border bg-background">
            <div className="border-b border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">Resposta</span>
                  <span className="text-[10px] text-muted-foreground">
                    Selecione um status para ver o corpo de exemplo retornado pela API
                  </span>
                </div>
                {result && (
                  <span className="text-[11px] text-muted-foreground">
                    último teste:{" "}
                    <b className={result.status < 300 ? "text-emerald-400" : "text-rose-400"}>
                      {result.status}
                    </b>
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {STATUS_LIST.map((s) => {
                  const meta = STATUS_META[s];
                  const isActive = selectedStatus === s;
                  const tone = meta.tone === "success";
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedStatus(s)}
                      title={meta.label}
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-mono transition ${
                        isActive
                          ? tone
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                            : "border-rose-500/40 bg-rose-500/15 text-rose-400"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                <b className={STATUS_META[selectedStatus].tone === "success" ? "text-emerald-400" : "text-rose-400"}>
                  {selectedStatus}
                </b>{" "}
                — {STATUS_META[selectedStatus].label}
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {result && result.status === selectedStatus ? "resposta real (testada)" : "exemplo"}
              </span>
              <button
                onClick={() => {
                  const useReal = result && result.status === selectedStatus;
                  const txt = useReal
                    ? result!.body
                    : JSON.stringify(exampleForStatus(endpoint, selectedStatus), null, 2);
                  copy(txt, "res");
                }}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {copied === "res" ? (
                  <><Check className="h-3 w-3 text-emerald-400" /> copiado</>
                ) : (
                  <><Copy className="h-3 w-3" /> copiar</>
                )}
              </button>
            </div>
            <pre className="max-h-[45vh] overflow-auto p-3 font-mono text-[11px] leading-relaxed">
              <code>
                {result && result.status === selectedStatus
                  ? result.body
                  : JSON.stringify(exampleForStatus(endpoint, selectedStatus), null, 2)}
              </code>
            </pre>
          </div>

          <div className="text-[11px] text-muted-foreground">
            <ChevronRight className="mr-1 inline h-3 w-3" />
            Dica: a API key fica salva localmente neste navegador.
          </div>
        </aside>
          </>
        ) : (
          <main className="col-span-2 flex h-[calc(100vh-56px)] items-center justify-center p-8">
            <div className="max-w-md text-center">
              <Code2 className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-xl font-semibold">Selecione um endpoint</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Escolha um endpoint na barra lateral para ver os detalhes, os
                parâmetros e testar chamadas em tempo real.
              </p>
            </div>
          </main>
        )}
      </div>
        </>
      )}
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

// ---------------------------------------------------------------------------
// Introdução (pt-BR)
// ---------------------------------------------------------------------------
function IntroductionView() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="text-sm font-semibold uppercase tracking-wider text-primary">
        Introdução
      </div>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">
        API Pública Zailom Booking
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Uma interface REST/JSON para a plataforma de agendamentos Zailom
        Booking. Construa chatbots, aplicativos mobile e integrações de
        terceiros sobre o mesmo motor que alimenta o nosso painel web — com
        uma única fonte de verdade para disponibilidade, agendamentos e
        pagamentos.
      </p>

      <Section title="Visão geral">
        <p className="text-sm leading-relaxed text-muted-foreground">
          A API expõe as primitivas centrais do sistema — serviços,
          colaboradores, clientes, disponibilidade, agendamentos, pagamentos e
          notificações — através de endpoints HTTP estáveis. Ela é uma camada
          fina de transporte: toda regra de negócio (horários de funcionamento,
          escalas, intervalos, ausências, realocações, concorrência e fuso
          horário) vive dentro da plataforma, e não no cliente. Isso garante
          que o resultado seja idêntico, seja o consumidor o painel web, um
          app mobile ou um bot de WhatsApp.
        </p>
      </Section>

      <Section title="Base URL">
        <div className="rounded-lg border border-border bg-card/50 p-4 font-mono text-sm">
          https://api-booking.zailom.com/v1
        </div>
        <p className="text-sm text-muted-foreground">
          Todos os endpoints da referência são relativos a esta base. HTTPS é
          obrigatório.
        </p>
      </Section>

      <Section title="Autenticação">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Toda requisição precisa incluir uma API key vinculada a uma empresa.
          Envie no header{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">Authorization</code>{" "}
          como Bearer token, ou no header{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">x-api-key</code>.
        </p>
        <pre className="overflow-auto rounded-lg border border-border bg-background p-4 font-mono text-xs">
{`Authorization: Bearer zlm_XXXXXXXXXXXXXXXX
# ou
x-api-key: zlm_XXXXXXXXXXXXXXXX`}
        </pre>
        <p className="text-sm text-muted-foreground">
          As chaves possuem escopos: <code>read</code> (GET) e{" "}
          <code>write</code> (POST/PUT/PATCH/DELETE). Podem ser rotacionadas a
          qualquer momento no painel administrativo da empresa.
        </p>
      </Section>

      <Section title="Como o sistema funciona">
        <p className="text-sm leading-relaxed text-muted-foreground">
          O motor de agendamento é organizado em três conceitos:
        </p>
        <ul className="ml-5 list-disc space-y-2 text-sm text-muted-foreground">
          <li>
            <b className="text-foreground">Catálogo</b> — serviços,
            colaboradores e os vínculos que descrevem quem executa o quê e por
            quanto tempo.
          </li>
          <li>
            <b className="text-foreground">Disponibilidade</b> — uma fonte
            única de verdade (o motor <code>get_available_slots</code>) que
            projeta horário de trabalho, intervalos, ausências, bloqueios e
            agendamentos existentes em uma lista de horários livres. Sempre
            consulte antes de oferecer um horário ao cliente.
          </li>
          <li>
            <b className="text-foreground">Agendamentos</b> — o lado de
            escrita. Criar, cancelar ou reagendar sempre passa pela mesma
            validação de disponibilidade, prevenindo overbooking no nível do
            banco de dados.
          </li>
        </ul>
      </Section>

      <Section title="Fluxo recomendado">
        <ol className="ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
          <li>Liste serviços e colaboradores.</li>
          <li>
            Consulte <code>/availability/dates</code> para exibir um calendário
            com os dias que possuem pelo menos um horário livre.
          </li>
          <li>
            Consulte <code>/availability/slots</code> para o dia escolhido e
            deixe o usuário selecionar o horário.
          </li>
          <li>Faça upsert do cliente pelo telefone com <code>POST /clients</code>.</li>
          <li>
            Reconsulte <code>/availability/slots</code> imediatamente antes de
            confirmar (os slots podem ficar stale em segundos) e então chame{" "}
            <code>POST /bookings</code> com <code>booking_date</code> +{" "}
            <code>booking_time</code>.
          </li>
          <li>
            Opcionalmente crie uma cobrança via <code>POST /payments</code> e
            monitore as mudanças de status.
          </li>
        </ol>
      </Section>

      <Section title="Contrato de data e hora">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Para evitar ambiguidade de fuso, agendamentos usam campos literais:
        </p>
        <ul className="ml-5 list-disc space-y-2 text-sm text-muted-foreground">
          <li>
            <code>booking_date</code>: <code>YYYY-MM-DD</code>
          </li>
          <li>
            <code>booking_time</code>: <code>HH:mm</code> (24h)
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Nunca envie <code>start_time</code> em ISO como{" "}
          <code>2026-07-15T15:00:00Z</code>. O servidor interpreta literais no
          fuso da empresa (<code>America/Sao_Paulo</code>).
        </p>
      </Section>

      <Section title="Erros">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Toda resposta de erro segue o mesmo formato:
        </p>
        <pre className="overflow-auto rounded-lg border border-border bg-background p-4 font-mono text-xs">
{`{ "error": "mensagem", "reason": "codigo_opcional" }`}
        </pre>
        <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
          <li><b className="text-foreground">400</b> — payload inválido</li>
          <li><b className="text-foreground">401</b> — API key ausente/ inválida</li>
          <li><b className="text-foreground">403</b> — escopo insuficiente</li>
          <li><b className="text-foreground">404</b> — recurso não encontrado</li>
          <li><b className="text-foreground">409</b> — conflito (ex.: slot indisponível)</li>
          <li><b className="text-foreground">500</b> — erro interno</li>
        </ul>
      </Section>

      <Section title="Rate limit e idempotência">
        <p className="text-sm leading-relaxed text-muted-foreground">
          A API aplica rate limits por chave e valida cada escrita contra o
          portão de disponibilidade — retentar um <code>POST /bookings</code>{" "}
          que falhou não cria duplicados: a segunda tentativa retorna{" "}
          <code>409 slot_unavailable</code> caso o horário já esteja ocupado.
        </p>
      </Section>

      <Section title="Próximos passos">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Abra a aba <b className="text-foreground">Endpoints</b> para navegar
          pela referência completa, testar requisições em tempo real com sua
          API key e copiar snippets cURL prontos.
        </p>
      </Section>

      <Section title="Especificação OpenAPI">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Esta documentação também é publicada como um documento{" "}
          <b className="text-foreground">OpenAPI 3.1</b> gerado automaticamente
          a partir do mesmo catálogo de endpoints. Baixe o arquivo para importar
          no Postman, Insomnia ou usar como entrada de um gerador de SDK, ou
          abra a visualização em Swagger UI.
        </p>
        <div className="flex flex-wrap gap-2">
          <OpenApiExportMenu variant="inline" />
          <a
            href="/api-docs/swagger"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <FileCode2 className="h-3.5 w-3.5" />
            Abrir Swagger UI
          </a>
        </div>
      </Section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// OpenAPI export menu — baixa JSON/YAML gerado a partir do catálogo ENDPOINTS
// ---------------------------------------------------------------------------
function OpenApiExportMenu({ variant = "header" }: { variant?: "header" | "inline" }) {
  const [open, setOpen] = useState(false);

  const spec = useMemo(() => buildOpenApiSpec(ENDPOINTS), []);

  const downloadJson = () => {
    downloadBlob("zailom-booking-openapi.json", specToJson(spec), "application/json");
    setOpen(false);
  };
  const downloadYaml = () => {
    downloadBlob("zailom-booking-openapi.yaml", specToYaml(spec), "application/yaml");
    setOpen(false);
  };
  const openInSwaggerEditor = () => {
    // Copy the spec to clipboard and open the online editor — the user can
    // paste directly. Avoids depending on the spec being publicly hosted.
    navigator.clipboard.writeText(specToYaml(spec)).catch(() => undefined);
    window.open("https://editor.swagger.io/", "_blank", "noopener");
    setOpen(false);
  };

  const trigger = (
    <button
      onClick={() => setOpen((v) => !v)}
      className={
        variant === "header"
          ? "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted"
          : "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
      }
    >
      <Download className="h-3.5 w-3.5" />
      OpenAPI
    </button>
  );

  return (
    <div className="relative">
      {trigger}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <button
              onClick={downloadJson}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <FileJson className="h-3.5 w-3.5 text-primary" />
              <div>
                <div className="font-medium">Baixar openapi.json</div>
                <div className="text-[10px] text-muted-foreground">Postman / Insomnia / SDKs</div>
              </div>
            </button>
            <button
              onClick={downloadYaml}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <FileCode2 className="h-3.5 w-3.5 text-primary" />
              <div>
                <div className="font-medium">Baixar openapi.yaml</div>
                <div className="text-[10px] text-muted-foreground">Formato canônico</div>
              </div>
            </button>
            <button
              onClick={openInSwaggerEditor}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <div>
                <div className="font-medium">Abrir no Swagger Editor</div>
                <div className="text-[10px] text-muted-foreground">Copia o YAML e abre o editor online</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
