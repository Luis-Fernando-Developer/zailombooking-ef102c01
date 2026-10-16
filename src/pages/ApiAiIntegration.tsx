import { useState } from "react";
import { BookOpen, Bot, Check, Copy, Download, ExternalLink, FileCode2, FileJson, Workflow } from "lucide-react";
import { ENDPOINTS, type Endpoint } from "@/lib/endpoints-catalog";

const API_BASE = "https://api-booking.zailom.com/v1";
const GUIDE_URL = "/ai-integration.md";

function methodPath(endpoint: Endpoint) {
  const path = endpoint.path.replace(/:([a-zA-Z0-9_]+)/g, "{{$1}}");
  const query = endpoint.params
    .filter((param) => param.location === "query")
    .map((param) => `${param.name}={{${param.templateName ?? param.name}}}`)
    .join("&");
  return `${API_BASE}${path}${query ? `?${query}` : ""}`;
}

const groups = Array.from(new Set(ENDPOINTS.map((endpoint) => endpoint.group)));

export default function ApiAiIntegration() {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  async function copyGuide() {
    setCopying(true);
    try {
      const response = await fetch(GUIDE_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error("Não foi possível carregar o guia.");
      await navigator.clipboard.writeText(await response.text());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("[ApiAiIntegration] copy guide failed", error);
      window.alert("Não foi possível copiar o guia. Use o botão para abrir ou baixar o arquivo Markdown.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-[1500px] flex-wrap items-center gap-3 px-4 py-2">
          <a href="/api-docs/introduction" className="flex items-center gap-2">
            <img src="/logo_zailom.svg" alt="Zailom" className="h-7 w-7 object-contain" />
            <img src="/brand_name_zailom_booking.svg" alt="Zailom Booking" className="hidden h-5 sm:block" />
          </a>
          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
            <a href="/api-docs/introduction" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground">Introduction</a>
            <a href="/api-docs/endpoint/v1" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground">Endpoints</a>
            <a href="/api-docs/swagger" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"><FileCode2 className="mr-1 inline h-3.5 w-3.5" />Swagger UI</a>
            <a href="/api-docs/ai-integration" className="rounded-md bg-primary/15 px-3 py-1.5 font-medium text-foreground"><Bot className="mr-1 inline h-3.5 w-3.5" />Guia para IA</a>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/openapi.json" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"><FileJson className="h-3.5 w-3.5" />OpenAPI JSON</a>
            <a href="/openapi.yaml" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"><FileCode2 className="h-3.5 w-3.5" />OpenAPI YAML</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-primary/20 bg-background p-3"><Bot className="h-6 w-6 text-primary" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Documentação de integração</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Guia de integração para IA</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Contexto de negócio para agentes de IA: quando usar cada operação, quais dependências respeitar e como interpretar as respostas da API do Zailom Booking. Use junto com o contrato OpenAPI; este guia não o substitui.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={copyGuide} disabled={copying} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copying ? "Carregando guia..." : copied ? "Guia copiado" : "Copiar guia completo"}
                </button>
                <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"><ExternalLink className="h-4 w-4" />Abrir Markdown</a>
                <a href={GUIDE_URL} download="zailom-booking-ai-integration.md" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"><Download className="h-4 w-4" />Baixar guia</a>
              </div>
              <p className="mt-3 break-all text-xs text-muted-foreground">URL pública do guia: <code>{window.location.origin}{GUIDE_URL}</code></p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-border bg-card p-5">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="mt-3 font-semibold">Contrato técnico</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">OpenAPI define métodos, rotas, parâmetros, autenticação e estruturas de entrada/saída.</p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5">
            <Workflow className="h-5 w-5 text-primary" />
            <h2 className="mt-3 font-semibold">Fluxos de negócio</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">O guia diferencia checkout online com reserva temporária, criação direta, pagamentos e estados.</p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="mt-3 font-semibold">Orientação ao agente</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">A IA deve escolher a operação pelo objetivo e pelo estado atual, não pela ordem da lista.</p>
          </article>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Regras fundamentais</h2>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground md:grid-cols-2">
            <li className="rounded-lg bg-muted/35 p-3">Use IDs oficiais como <code>service_id</code>, <code>employee_id</code>, <code>client_id</code>, <code>hold_id</code> e <code>booking_id</code>.</li>
            <li className="rounded-lg bg-muted/35 p-3">Revalide disponibilidade antes de criar uma reserva ou agendamento.</li>
            <li className="rounded-lg bg-muted/35 p-3">Não finalize uma reserva temporária enquanto o pagamento não estiver confirmado.</li>
            <li className="rounded-lg bg-muted/35 p-3">Não crie um agendamento direto após finalizar o hold: isso pode duplicar a solicitação.</li>
            <li className="rounded-lg bg-muted/35 p-3">Não declare sucesso sem ler o corpo e os estados retornados pela API.</li>
            <li className="rounded-lg bg-muted/35 p-3">Não invente endpoints, parâmetros, métodos de pagamento ou eventos de notificação.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Fluxo online: reserva temporária e pagamento</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            <li>Consultar serviços, profissionais e disponibilidade; validar o cliente.</li>
            <li>Reconsultar horários e criar a reserva com <code>POST /booking-holds</code>.</li>
            <li>Consultar <code>GET /payments/methods</code> e gerar a cobrança usando <code>POST /payments</code> com <code>hold_id</code>.</li>
            <li>Consultar <code>GET /payments/{{payment_id}}</code> até haver um estado de pagamento confirmado.</li>
            <li>Finalizar com <code>POST /booking-holds/{{hold_id}}/complete</code> e usar o <code>booking_id</code> retornado.</li>
          </ol>
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-6 text-muted-foreground">
            Não chame <code>POST /bookings</code> para a mesma solicitação depois de finalizar a reserva. A finalização efetiva o agendamento associado ao checkout.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Fluxo de criação direta</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            <code>POST /bookings</code> é uma operação distinta do checkout com reserva temporária. O contrato publicado atualmente não documenta <code>payment_method</code> nem um modo explícito de pagamento no local; a implementação usa <code>booking_status: confirmed</code> e <code>payment_status: pending</code> como padrões. Portanto, não presuma que essa operação registre o método escolhido ou aguarde aprovação manual. Essa regra precisa ser definida no contrato antes de orientar um agente a depender dela.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Catálogo de endpoints</h2>
              <p className="mt-1 text-sm text-muted-foreground">Gerado a partir do catálogo usado pela documentação técnica.</p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{ENDPOINTS.length} operações</span>
          </div>
          <div className="mt-5 space-y-6">
            {groups.map((group) => (
              <div key={group}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  {ENDPOINTS.filter((endpoint) => endpoint.group === group).map((endpoint) => (
                    <div key={endpoint.id} className="border-b border-border p-3 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${endpoint.method === "GET" ? "bg-emerald-500/10 text-emerald-600" : endpoint.method === "POST" ? "bg-sky-500/10 text-sky-600" : endpoint.method === "PATCH" ? "bg-violet-500/10 text-violet-600" : "bg-amber-500/10 text-amber-600"}`}>{endpoint.method}</span>
                        <code className="break-all text-xs sm:text-sm">{methodPath(endpoint)}</code>
                        <span className="text-sm font-medium">{endpoint.title}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{endpoint.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Contrato técnico e arquivos</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">O guia fornece regras de utilização; confira os detalhes técnicos no OpenAPI e nos endpoints individuais.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/openapi.json" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><FileJson className="h-4 w-4" />OpenAPI JSON</a>
            <a href="/openapi.yaml" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><FileCode2 className="h-4 w-4" />OpenAPI YAML</a>
            <a href="/.well-known/openapi.json" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ExternalLink className="h-4 w-4" />OpenAPI well-known</a>
          </div>
        </section>
      </main>
    </div>
  );
}
