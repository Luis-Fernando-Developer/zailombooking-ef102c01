import { useState } from "react";
import { jsPDF } from "jspdf";
import { BookOpen, Bot, Check, Copy, Download, ExternalLink, FileCode2, FileJson, FileText, ChevronDown, Workflow } from "lucide-react";
import { ENDPOINTS, type Endpoint } from "@/lib/endpoints-catalog";

const API_BASE = "https://api-booking.zailom.com/v1";
const GUIDE_URL = "/ai-integration.md";
const MARKDOWN_VIEW_URL = "/api-docs/ai-integration/markdown";
const BUSINESS_VARIABLES = [
  ["service_id", "ID do serviço escolhido"], ["employee_id", "ID do profissional"],
  ["client_id", "ID do cliente"], ["booking_id", "ID do agendamento"],
  ["hold_id", "ID da reserva temporária"], ["payment_id", "ID do pagamento"],
  ["date_init", "Data inicial; enviado no parâmetro HTTP `from`"],
  ["date_end", "Data final; enviado no parâmetro HTTP `to`"], ["date", "Data consultada"],
  ["booking_date", "Data do agendamento"], ["booking_time", "Horário do agendamento"],
  ["phone", "Telefone/WhatsApp"], ["name", "Nome do cliente"], ["email", "E-mail do cliente"],
  ["scope", "upcoming, past ou all"], ["reason", "Motivo de cancelamento"],
  ["new_date", "Nova data no reagendamento"], ["new_time", "Novo horário no reagendamento"],
  ["method", "Método de cobrança aceito pelo endpoint"], ["event", "Evento de notificação configurado"],
  ["hold_minutes", "Duração do hold (1 a 30 minutos; padrão 10)"],
] as const;

async function loadCombinedGuide() {
  const [guideResponse, specResponse] = await Promise.all([fetch(GUIDE_URL, { cache: "no-cache" }), fetch("/openapi.json", { cache: "no-cache" })]);
  if (!guideResponse.ok || !specResponse.ok) throw new Error("Não foi possível carregar o guia e o OpenAPI.");
  const guide = await guideResponse.text();
  const spec = JSON.stringify(JSON.parse(await specResponse.text()), null, 2);
  return guide.trim() + "\n\n---\n\n# Apêndice técnico — OpenAPI JSON integral\n\nO bloco abaixo contém a especificação OpenAPI JSON completa associada à documentação.\n\n```json\n" + spec + "\n```\n";
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

function downloadGuidePdf(content: string) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40, pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight(); let y = margin;
  for (const line of content.split("\n")) {
    const heading = line.startsWith("#"); const fontSize = line.startsWith("# ") ? 15 : line.startsWith("## ") ? 11 : line.startsWith("```") ? 6 : 8;
    pdf.setFont("helvetica", heading ? "bold" : "normal"); pdf.setFontSize(fontSize);
    for (const part of pdf.splitTextToSize(line || " ", pageWidth - margin * 2)) {
      const lineHeight = fontSize * 1.35; if (y + lineHeight > pageHeight - margin) { pdf.addPage(); y = margin; }
      pdf.text(part, margin, y); y += lineHeight;
    }
    y += 2;
  }
  pdf.save("zailom-booking-guia-ia-com-openapi.pdf");
}


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
  const [exportOpen, setExportOpen] = useState(false);

  async function copyGuide() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(await loadCombinedGuide());
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
                <a href={MARKDOWN_VIEW_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"><ExternalLink className="h-4 w-4" />Abrir Markdown</a>
                <div className="relative">
                  <button onClick={() => setExportOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted">
                    <Download className="h-4 w-4" />Baixar guia + OpenAPI <ChevronDown className="h-4 w-4" />
                  </button>
                  {exportOpen && <>
                    <button aria-label="Fechar menu de exportação" className="fixed inset-0 z-20 cursor-default" onClick={() => setExportOpen(false)} />
                    <div className="absolute left-0 z-30 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                      <button onClick={async () => { try { downloadTextFile("zailom-booking-guia-ia-com-openapi.md", await loadCombinedGuide(), "text/markdown"); } catch (error) { console.error(error); window.alert("Não foi possível gerar o Markdown combinado."); } finally { setExportOpen(false); } }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted">
                        <FileCode2 className="h-4 w-4" /><span><b className="block">Markdown (.md)</b><small className="text-muted-foreground">Guia + OpenAPI JSON no final</small></span>
                      </button>
                      <button onClick={async () => { try { const content = await loadCombinedGuide(); const fence = String.fromCharCode(96).repeat(3); downloadTextFile("zailom-booking-guia-ia-com-openapi.txt", content.replace(/^#{1,6} /gm, "").replaceAll(fence + "json", "").replaceAll(fence, ""), "text/plain"); } catch (error) { console.error(error); window.alert("Não foi possível gerar o TXT combinado."); } finally { setExportOpen(false); } }} className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left text-sm hover:bg-muted">
                        <FileText className="h-4 w-4" /><span><b className="block">Texto (.txt)</b><small className="text-muted-foreground">Guia + OpenAPI JSON no final</small></span>
                      </button>
                      <button onClick={async () => { try { downloadGuidePdf(await loadCombinedGuide()); } catch (error) { console.error(error); window.alert("Não foi possível gerar o PDF combinado."); } finally { setExportOpen(false); } }} className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left text-sm hover:bg-muted">
                        <FileText className="h-4 w-4" /><span><b className="block">PDF (.pdf)</b><small className="text-muted-foreground">Guia + OpenAPI JSON no final</small></span>
                      </button>
                    </div>
                  </>}
                </div>
              </div>
              <p className="mt-3 break-all text-xs text-muted-foreground">Markdown original: <code>{window.location.origin}{GUIDE_URL}</code> · As exportações incluem o OpenAPI JSON integral ao final.</p>
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
            <li className="rounded-lg bg-muted/35 p-3">Use exclusivamente os nomes de variáveis oficiais listados na seção abaixo. Não substitua IDs por nomes exibidos ao usuário.</li>
            <li className="rounded-lg bg-muted/35 p-3">Revalide disponibilidade antes de criar uma reserva ou agendamento.</li>
            <li className="rounded-lg bg-muted/35 p-3">Não finalize uma reserva temporária enquanto o pagamento não estiver confirmado.</li>
            <li className="rounded-lg bg-muted/35 p-3">Não crie um agendamento direto após finalizar o hold: isso pode duplicar a solicitação.</li>
            <li className="rounded-lg bg-muted/35 p-3">Não declare sucesso sem ler o corpo e os estados retornados pela API.</li>
            <li className="rounded-lg bg-muted/35 p-3">Não invente endpoints, parâmetros, métodos de pagamento ou eventos de notificação.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Variáveis e parâmetros oficiais</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Lista consolidada de placeholders utilizados pelos endpoints publicados. <code>date_init</code> e <code>date_end</code> são enviados na query string como <code>from</code> e <code>to</code>; o nome da variável de template nem sempre é igual ao nome do parâmetro HTTP.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {BUSINESS_VARIABLES.map(([name, description]) => <div key={name} className="rounded-md bg-muted/35 p-3"><code className="text-xs text-primary">{`{{${name}}}`}</code><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>)}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Campos como <code>booking_status</code>, <code>payment_status</code>, <code>payment_method</code>, <code>status</code>, <code>price</code>, <code>expires_at</code>, <code>payment_mode</code>, <code>methods</code>, <code>provider</code> e <code>payout_flow</code> são campos de entrada/saída ou estados, não variáveis universais. <code>id</code> não deve ser confundido automaticamente com <code>booking_id</code>, <code>hold_id</code> ou <code>payment_id</code>.</p>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Fluxo online: reserva temporária e pagamento</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            <li>Chamar <code>GET /services</code>; quando o cliente escolher, guardar <code>service_id</code> e consultar detalhes, preço ou duração se necessário.</li>
            <li>Chamar <code>GET /services/{'{{service_id}}'}/employees</code> ou <code>GET /employees?service_id={'{{service_id}}'}</code> e guardar o <code>employee_id</code> escolhido.</li>
            <li>Consultar <code>GET /availability/dates</code> com <code>employee_id</code>, <code>service_id</code>, <code>from={'{{date_init}}'}</code> e <code>to={'{{date_end}}'}</code>; depois consultar <code>GET /availability/slots</code> para a data escolhida.</li>
            <li>Resolver o cliente com <code>GET /clients?phone={'{{phone}}'}</code>; se não existir, usar <code>POST /clients</code> e guardar o <code>client_id</code>.</li>
            <li>Reconsultar os horários imediatamente antes da escrita e chamar <code>POST /booking-holds</code> com <code>client_id</code>, <code>service_id</code>, <code>employee_id</code>, <code>booking_date</code> e <code>booking_time</code>. Guardar <code>hold_id</code> e <code>expires_at</code>.</li>
            <li>Consultar <code>GET /payments/methods</code> e usar somente os métodos habilitados. Criar cobrança com <code>POST /payments</code> enviando <code>hold_id</code> e <code>method</code>; nunca enviar também <code>booking_id</code>.</li>
            <li>Consultar <code>{'GET /payments/{{payment_id}}'}</code>; enquanto o estado não for confirmado, não finalizar o hold nem afirmar que houve pagamento.</li>
            <li>Somente após confirmação, chamar <code>{'POST /booking-holds/{{hold_id}}/complete'}</code> com <code>payment_id</code> e guardar o <code>booking_id</code> retornado.</li>
          </ol>
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-6 text-muted-foreground">
            Durante todo o checkout com hold — hold ativo, cobrança criada, aguardando pagamento e após a conclusão — não chame <code>POST /bookings</code> para a mesma solicitação. Se o checkout falhar ou expirar, verifique o hold e a disponibilidade antes de recomeçar; não use criação direta como fallback automático.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Fluxo de criação direta</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            <code>POST /bookings</code> é uma operação distinta do checkout online. No site, o fluxo de pagamento no local pode registrar <code>payment_method: local</code> e <code>booking_status: pending</code>, aguardando confirmação manual de alguém autorizado; ao confirmar, passa a confirmado e, se cancelado, deixa de valer conforme as regras do Booking. Porém, o handler atual da API pública não grava <code>payment_method</code> e usa <code>booking_status: confirmed</code> e <code>payment_status: pending</code> como padrões. Enviar status no corpo não torna o modo local oficialmente suportado nem garante que o slot fique protegido como no site. Até que a API exponha e valide esse fluxo de ponta a ponta, não instrua a IA a simulá-lo com campos inventados nem prometa que o horário ficará reservado até a aprovação manual. O hold é para checkout online, não para pagamento no local.
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
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Use os dois em conjunto: este guia explica as decisões de negócio e a ordem correta; o OpenAPI define o contrato técnico estruturado, incluindo parâmetros, corpos e respostas. As exportações combinadas incluem o OpenAPI JSON integral no final para enviar um único arquivo a outra ferramenta de IA.</p>
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
