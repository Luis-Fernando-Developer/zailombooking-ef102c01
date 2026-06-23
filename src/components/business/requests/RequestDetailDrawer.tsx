import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, RotateCcw, Ban, Play, MessageSquarePlus } from "lucide-react";
import {
  SolicitacaoRow, RequestComment, RequestAudit,
  fetchComments, fetchAudit, decideRequest, applyRequest, addComment,
  REQUEST_TYPE_LABELS, PRIORITY_LABELS, isFinal,
} from "@/lib/api/requests";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { ScheduleApprovalTable } from "./ScheduleApprovalTable";

interface Props {
  request: SolicitacaoRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canDecide: boolean;
  currentUserId?: string | null;
  onChanged?: () => void;
}

export function RequestDetailDrawer({ request, open, onOpenChange, canDecide, currentUserId, onChanged }: Props) {
  const { toast } = useToast();
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [audit, setAudit] = useState<RequestAudit[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request) return;
    fetchComments(request.id).then(setComments).catch(() => {});
    fetchAudit(request.id).then(setAudit).catch(() => {});
  }, [request?.id]);

  if (!request) return null;
  const final = isFinal(request.status);
  const isCreator = currentUserId && request.created_by === currentUserId;

  const refresh = async () => {
    const [c, a] = await Promise.all([fetchComments(request.id), fetchAudit(request.id)]);
    setComments(c); setAudit(a);
    onChanged?.();
  };

  const handleDecide = async (decision: "approve" | "reject" | "request_revision" | "cancel") => {
    setBusy(true);
    try {
      await decideRequest({ request_id: request.id, decision, comment: comment || undefined });
      toast({ title: "Solicitação atualizada" });
      setComment("");
      if (decision === "approve") {
        try {
          await applyRequest(request.id);
          toast({ title: "Aplicada com sucesso" });
        } catch (e: any) {
          toast({ title: "Aprovada, mas falhou ao aplicar", description: e.message, variant: "destructive" });
        }
      }
      await refresh();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await addComment(request.id, comment.trim());
      setComment("");
      await refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-gradient">{request.title}</SheetTitle>
          <SheetDescription>
            {REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <RequestStatusBadge status={request.status} />
            <span className="text-xs text-muted-foreground">
              Prioridade: {PRIORITY_LABELS[request.priority]}
            </span>
            <span className="text-xs text-muted-foreground">
              Criada {format(new Date(request.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
            </span>
          </div>

          {request.description && (
            <div>
              <p className="text-sm font-medium mb-1">Descrição</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.description}</p>
            </div>
          )}

          {request.request_type === "schedule_change" && request.request_payload?.schedule_id ? (
            <div>
              <p className="text-sm font-medium mb-2">Linhas da escala</p>
              <ScheduleApprovalTable
                scheduleId={request.request_payload.schedule_id}
                tenantId={request.tenant_id}
                canDecide={canDecide && !final}
                onChanged={onChanged}
              />
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium mb-1">Dados</p>
              <pre className="text-xs bg-muted/40 p-3 rounded-md overflow-auto max-h-48 border border-border">
{JSON.stringify(request.request_payload ?? {}, null, 2)}
              </pre>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">Comentários</p>
            <div className="space-y-2 max-h-40 overflow-auto pr-1">
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem comentários.</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="text-sm border-l-2 border-primary/30 pl-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author_name ?? "Usuário"}</span>
                    {c.author_profile ? ` · ${c.author_profile}` : c.author_role ? ` · ${c.author_role}` : ""}
                    {" · "}
                    {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  <p className="whitespace-pre-wrap">{c.message}</p>
                </div>
              ))}
            </div>
            <Textarea
              className="mt-2"
              placeholder="Escrever comentário (será incluído na decisão também)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
            <Button size="sm" variant="ghost" className="mt-1" onClick={handleAddComment} disabled={busy || !comment.trim()}>
              <MessageSquarePlus className="w-4 h-4 mr-1" /> Adicionar comentário
            </Button>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">Histórico</p>
            <div className="space-y-1 text-xs text-muted-foreground max-h-32 overflow-auto pr-1">
              {audit.map((a) => (
                <div key={a.id}>
                  · {format(new Date(a.created_at), "dd/MM HH:mm", { locale: ptBR })} — <b>{a.action}</b>
                  {a.actor_role ? ` (${a.actor_role})` : ""}
                </div>
              ))}
            </div>
          </div>

          {!final && (
            <div className="flex flex-wrap gap-2 pt-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 -mx-6 px-6 border-t">
              {canDecide && (
                <>
                  <Button onClick={() => handleDecide("approve")} disabled={busy}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Aprovar
                  </Button>
                  <Button variant="destructive" onClick={() => handleDecide("reject")} disabled={busy}>
                    <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                  </Button>
                  <Button variant="outline" onClick={() => handleDecide("request_revision")} disabled={busy}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Pedir revisão
                  </Button>
                </>
              )}
              {isCreator && (
                <Button variant="ghost" onClick={() => handleDecide("cancel")} disabled={busy}>
                  <Ban className="w-4 h-4 mr-1" /> Cancelar
                </Button>
              )}
            </div>
          )}

          {request.status === "approved" && (
            <Button variant="outline" onClick={async () => {
              setBusy(true);
              try { await applyRequest(request.id); toast({ title: "Re-aplicada" }); }
              catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
              finally { setBusy(false); }
            }} disabled={busy}>
              <Play className="w-4 h-4 mr-1" /> Re-aplicar
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
