import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, RotateCcw } from "lucide-react";
import { listPendingApprovals, decideApproval } from "@/lib/api/marketing";

export function ApprovalsTab({ companyId, role, canApprove }: { companyId: string; role: string; canApprove: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [observations, setObservations] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ['mkt-pending', companyId],
    queryFn: () => listPendingApprovals(companyId),
  });

  const decide = useMutation({
    mutationFn: (p: { targetType: 'material' | 'campaign'; targetId: string; decision: 'approved' | 'rejected' | 'revision_requested' }) => {
      const obs = observations[p.targetId];
      if (!obs || obs.trim().length < 3) throw new Error("Observação obrigatória (mínimo 3 chars).");
      return decideApproval({ ...p, companyId, observation: obs, role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mkt-pending', companyId] });
      qc.invalidateQueries({ queryKey: ['mkt-materials', companyId] });
      qc.invalidateQueries({ queryKey: ['mkt-campaigns', companyId] });
      toast({ title: "Decisão registrada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!canApprove) return <p className="text-muted-foreground">Você não tem permissão para aprovar.</p>;

  const renderCard = (item: any, type: 'material' | 'campaign') => (
    <Card key={`${type}-${item.id}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-base">{item.title || item.name}</CardTitle>
          <Badge variant="outline">{type === 'material' ? 'Material' : 'Campanha'}</Badge>
        </div>
        <CardDescription>Por {item.created_by?.slice(0, 8) ?? '—'} · {new Date(item.created_at).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
        <Textarea
          placeholder="Observação (obrigatória)"
          value={observations[item.id] ?? ''}
          onChange={(e) => setObservations({ ...observations, [item.id]: e.target.value })}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide.mutate({ targetType: type, targetId: item.id, decision: 'approved' })}>
            <Check className="w-3 h-3 mr-1" /> Aprovar
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide.mutate({ targetType: type, targetId: item.id, decision: 'revision_requested' })}>
            <RotateCcw className="w-3 h-3 mr-1" /> Solicitar revisão
          </Button>
          <Button size="sm" variant="destructive" onClick={() => decide.mutate({ targetType: type, targetId: item.id, decision: 'rejected' })}>
            <X className="w-3 h-3 mr-1" /> Reprovar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Aprovações Pendentes</h2>
        <p className="text-sm text-muted-foreground">Materiais e campanhas aguardando decisão.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {q.data?.materials.map((m) => renderCard(m, 'material'))}
        {q.data?.campaigns.map((c) => renderCard(c, 'campaign'))}
        {q.data && q.data.materials.length === 0 && q.data.campaigns.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-12">Nenhuma pendência.</p>
        )}
      </div>
    </div>
  );
}
