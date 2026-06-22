import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2 } from "lucide-react";
import { listApproversAbove, submitSchedule } from "@/lib/api/schedules";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  scheduleId: string;
  scheduleName: string;
  onSubmitted?: () => void;
}

type Approver = Awaited<ReturnType<typeof listApproversAbove>>[number];

export function SubmitScheduleDialog({ open, onOpenChange, tenantId, scheduleId, scheduleName, onSubmitted }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"levels_above" | "specific_users">("levels_above");
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listApproversAbove(tenantId)
      .then((rows) => setApprovers(rows))
      .catch((e) => toast({ title: "Erro ao buscar destinatários", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, tenantId, toast]);

  // agrupa por perfil
  const grouped = approvers.reduce<Record<string, Approver[]>>((acc, a) => {
    (acc[a.profile_name] ??= []).push(a);
    return acc;
  }, {});

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (mode === "specific_users" && selectedUserIds.size === 0) {
      toast({ title: "Selecione ao menos um destinatário", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await submitSchedule({
        tenant_id: tenantId,
        schedule_id: scheduleId,
        target_mode: mode,
        target_user_ids: mode === "specific_users" ? Array.from(selectedUserIds) : undefined,
      });
      toast({
        title: "Escala enviada para aprovação",
        description: `${res?.recipients_count ?? 0} destinatário(s) notificado(s).`,
      });
      onOpenChange(false);
      onSubmitted?.();
    } catch (e) {
      toast({ title: "Falha ao enviar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar escala para aprovação</DialogTitle>
          <DialogDescription>{scheduleName}</DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg border">
            <RadioGroupItem value="levels_above" id="r-levels" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="r-levels" className="font-medium cursor-pointer">
                Enviar para cargos de nível maior
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Notifica automaticamente todos os colaboradores com permissão de aprovação acima de você.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg border">
            <RadioGroupItem value="specific_users" id="r-specific" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="r-specific" className="font-medium cursor-pointer">
                Setor específico — selecionar pessoas
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Notifica apenas os colaboradores marcados abaixo.
              </p>
            </div>
          </div>
        </RadioGroup>

        {mode === "specific_users" && (
          <SectorPicker
            loading={loading}
            grouped={grouped}
            selectedUserIds={selectedUserIds}
            toggleUser={toggleUser}
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectorPicker({
  loading, grouped, selectedUserIds, toggleUser,
}: {
  loading: boolean;
  grouped: Record<string, Array<{ user_id: string; name: string }>>;
  selectedUserIds: Set<string>;
  toggleUser: (id: string) => void;
}) {
  const sectors = Object.keys(grouped);
  const [sector, setSector] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="border rounded-md p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando setores...
      </div>
    );
  }
  if (sectors.length === 0) {
    return <p className="text-sm text-muted-foreground border rounded-md p-3">Nenhum aprovador acima do seu nível foi encontrado.</p>;
  }

  if (!sector) {
    return (
      <div className="border rounded-md p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selecione o setor</p>
        <div className="grid grid-cols-2 gap-2">
          {sectors.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSector(s)}
              className="text-left text-sm px-3 py-2 rounded-md border hover:bg-muted/50 transition-colors"
            >
              <div className="font-medium">{s}</div>
              <div className="text-xs text-muted-foreground">{grouped[s].length} pessoa(s)</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const users = grouped[sector] ?? [];
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sector}</p>
        <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setSector(null)}>
          ← trocar setor
        </button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {users.map((u) => (
          <label key={u.user_id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
            <Checkbox checked={selectedUserIds.has(u.user_id)} onCheckedChange={() => toggleUser(u.user_id)} />
            <span>{u.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
