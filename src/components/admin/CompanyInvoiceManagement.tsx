import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RefreshCw, Mail, Ban, RotateCcw, FileText, History, Loader2, CircleDollarSign } from "lucide-react";

type Invoice = {
  id: string;
  company_id: string;
  amount: number;
  amount_due?: number;
  discount_amount?: number;
  asaas_value?: number;
  status: string;
  billing_type: string | null;
  due_date: string;
  paid_at: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  description: string | null;
  asaas_payment_id: string | null;
  asaas_customer_id?: string | null;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
};

type AuditEntry = {
  id: string;
  invoice_id: string | null;
  action: string;
  previous_status: string | null;
  resulting_status: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Props = { companyId: string; companyName: string };

const statusLabels: Record<string, string> = {
  pending: "Em aberto", overdue: "Vencida", paid: "Paga", cancelled: "Cancelada",
  refunded: "Reembolsada", failed: "Falhou", processing: "Processando",
};
const actionLabels: Record<string, string> = {
  refresh_status: "Consulta manual ao Asaas",
  resend_charge: "Cobrança reenviada por e-mail",
  cancel_charge: "Cobrança cancelada",
  refund_charge: "Reembolso solicitado",
  generate_replacement_charge: "Nova cobrança gerada",
  replacement_charge_created: "Nova fatura registrada",
};
const money = (amount: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(amount || 0));
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";

export function CompanyInvoiceManagement({ companyId, companyName }: Props) {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ invoice: Invoice; action: "cancel" | "refund" | "regenerate" } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-company-invoice", {
        body: { action: "list", company_id: companyId },
      });
      if (error) {
        let message = error.message || "Falha ao consultar a função de faturas.";
        try {
          const context = (error as any)?.context;
          const parsed = await context?.clone?.().json?.();
          if (parsed?.error || parsed?.message) message = parsed.error || parsed.message;
        } catch {}
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      setInvoices((data?.invoices || []) as Invoice[]);
      setHistory((data?.history || []) as AuditEntry[]);
    } catch (error) {
      toast({ title: "Não foi possível carregar as faturas", description: error instanceof Error ? error.message : "Erro inesperado.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (invoice: Invoice, action: "refresh" | "resend" | "cancel" | "refund" | "regenerate") => {
    setBusyId(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-company-invoice", {
        body: { action, invoice_id: invoice.id },
      });
      if (error) {
        const context = (error as any)?.context;
        let message = error.message;
        try { const parsed = await context?.json?.(); if (parsed?.error) message = parsed.error; } catch {}
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      toast({ title: "Operação concluída", description: data?.message || ({
        refresh: "Status consultado diretamente no Asaas.",
        resend: "A cobrança foi reenviada para o e-mail da empresa.",
        cancel: "Cobrança cancelada e histórico preservado.",
        refund: "Solicitação de reembolso enviada ao Asaas.",
        regenerate: "Nova cobrança criada sem apagar a fatura anterior.",
      } as Record<string, string>)[action] });
      setConfirm(null);
      await load();
    } catch (error) {
      toast({ title: "Não foi possível concluir a operação", description: error instanceof Error ? error.message : "Erro inesperado.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const askConfirmation = (invoice: Invoice, action: "cancel" | "refund" | "regenerate") => setConfirm({ invoice, action });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><CircleDollarSign className="h-4 w-4 text-primary" /> Faturas e cobranças</CardTitle>
            <CardDescription className="mt-1">Gerencie as cobranças da empresa sem recriar o cadastro nem alterar as credenciais existentes.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && invoices.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando faturas...</div>
        ) : invoices.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma fatura encontrada para esta empresa.</div>
        ) : invoices.map((invoice) => {
          const status = String(invoice.status || "pending").toLowerCase();
          const isBusy = busyId === invoice.id;
          const payable = ["pending", "overdue", "processing"].includes(status);
          const canRegenerate = ["overdue", "cancelled", "failed", "refunded"].includes(status);
          const paymentUrl = invoice.invoice_url || invoice.bank_slip_url;
          return (
            <div key={invoice.id} className="rounded-lg border p-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm break-words">{invoice.description || "Assinatura Zailom Booking"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Vencimento: {date(invoice.due_date)} · Criada: {date(invoice.created_at)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Forma: {invoice.billing_type || "—"} · ID Asaas: {invoice.asaas_payment_id || "não vinculado"}</p>
                </div>
                <div className="text-right shrink-0">
                  {Number(invoice.discount_amount || 0) > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground line-through">{money(Number(invoice.asaas_value ?? invoice.amount))}</p>
                      <p className="font-semibold">{money(Number(invoice.amount_due ?? invoice.amount))}</p>
                      <p className="text-xs text-green-600">Desconto de {money(Number(invoice.discount_amount))}</p>
                    </>
                  ) : (
                    <p className="font-semibold">{money(Number(invoice.amount_due ?? invoice.amount))}</p>
                  )}
                  <Badge variant={status === "paid" ? "default" : status === "overdue" || status === "failed" ? "destructive" : "secondary"} className="mt-1">{statusLabels[status] || status}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {paymentUrl && status !== "cancelled" && <Button type="button" size="sm" variant="outline" asChild><a href={paymentUrl} target="_blank" rel="noreferrer"><FileText className="mr-1.5 h-3.5 w-3.5" /> Abrir / baixar fatura</a></Button>}
                {invoice.asaas_payment_id && status !== "cancelled" && <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void runAction(invoice, "refresh")}>{isBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Consultar Asaas</Button>}
                {payable && status !== "cancelled" && <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void runAction(invoice, "resend")}><Mail className="mr-1.5 h-3.5 w-3.5" /> Reenviar cobrança</Button>}
                {canRegenerate && <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => askConfirmation(invoice, "regenerate")}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Gerar nova cobrança</Button>}
                {payable && <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => askConfirmation(invoice, "cancel")}><Ban className="mr-1.5 h-3.5 w-3.5" /> Cancelar cobrança</Button>}
                {status === "paid" && invoice.asaas_payment_id && <Button type="button" size="sm" variant="destructive" disabled={isBusy} onClick={() => askConfirmation(invoice, "refund")}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reembolsar</Button>}
              </div>
              {status === "overdue" && <p className="text-xs text-amber-600">A fatura vencida continua sendo conciliada. A nova cobrança só será criada depois de confirmar que a anterior não poderá mais ser paga.</p>}
            </div>
          );
        })}

        <Separator />
        <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => setHistoryOpen(v => !v)}>
          <History className="mr-2 h-4 w-4" /> {historyOpen ? "Ocultar histórico administrativo" : `Ver histórico administrativo (${history.length})`}
        </Button>
        {historyOpen && (
          <div className="space-y-3">
            {history.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há operações administrativas registradas.</p> : history.map(entry => (
              <div key={entry.id} className="border-l-2 border-primary/30 pl-3 py-1">
                <p className="text-sm font-medium">{actionLabels[entry.action] || entry.action}</p>
                <p className="text-xs text-muted-foreground">{dateTime(entry.created_at)} · {entry.previous_status || "—"} → {entry.resulting_status || "—"}</p>
                {entry.details?.replacement_invoice_id && <p className="text-xs text-muted-foreground">Fatura substituta: {String(entry.details.replacement_invoice_id)}</p>}
                {entry.details?.recipient && <p className="text-xs text-muted-foreground">Enviado para: {String(entry.details.recipient)}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "cancel" ? "Cancelar esta cobrança?" : confirm?.action === "refund" ? "Solicitar reembolso?" : "Gerar nova cobrança?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "cancel"
                ? "A cobrança será cancelada no Asaas quando possível. O registro financeiro continuará no histórico."
                : confirm?.action === "refund"
                  ? "O reembolso será solicitado ao Asaas. Essa operação é financeira e não pode ser desfeita por aqui."
                  : `Será verificado o estado da cobrança anterior no Asaas. Uma nova cobrança só será criada se a anterior estiver cancelada e não puder mais ser paga. Os dados e a senha da empresa “${companyName}” serão preservados.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={!confirm || !!busyId} onClick={(event) => {
              event.preventDefault();
              if (confirm) void runAction(confirm.invoice, confirm.action);
            }}>
              {busyId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
