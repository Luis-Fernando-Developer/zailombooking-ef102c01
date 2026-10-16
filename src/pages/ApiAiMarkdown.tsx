import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, LoaderCircle } from "lucide-react";

export default function ApiAiMarkdown() {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/ai-integration.md", { cache: "no-cache" }),
      fetch("/openapi.json", { cache: "no-cache" }),
    ]).then(async ([guideResponse, specResponse]) => {
      if (!guideResponse.ok || !specResponse.ok) throw new Error("Não foi possível carregar o guia e o OpenAPI.");
      const guide = await guideResponse.text();
      const spec = JSON.stringify(JSON.parse(await specResponse.text()), null, 2);
      const fence = String.fromCharCode(96).repeat(3);
      if (active) setContent(guide.trim() + "\n\n---\n\n# Apêndice técnico — OpenAPI JSON integral\n\n" + fence + "json\n" + spec + "\n" + fence + "\n");
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar o documento."); });
    return () => { active = false; };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setError("O navegador não permitiu copiar o conteúdo."); }
  }

  function download() {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "zailom-booking-guia-ia-com-openapi.md";
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <a href="/api-docs/ai-integration" className="inline-flex items-center gap-2 text-sm hover:text-primary"><ArrowLeft className="h-4 w-4" />Voltar ao Guia para IA</a>
        <div className="flex gap-2">
          <button onClick={copy} disabled={!content} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"><Copy className="h-4 w-4" />{copied ? "Copiado" : "Copiar combinado"}</button>
          <button onClick={download} disabled={!content} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"><Download className="h-4 w-4" />Baixar .md</button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-6">
        <p className="mb-4 text-sm text-muted-foreground">Visualização do Markdown combinado. O apêndice OpenAPI JSON integral aparece no final do documento.</p>
        {error && <p role="alert" className="mb-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
        {!content && !error ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando guia e OpenAPI…</div> : <pre className="overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-card p-5 font-mono text-xs leading-6">{content}</pre>}
      </section>
    </main>
  );
}
