import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listHistory } from "@/lib/api/marketing";

export function HistoryTab({ companyId }: { companyId: string }) {
  const q = useQuery({ queryKey: ['mkt-history', companyId], queryFn: () => listHistory(companyId) });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Histórico</h2>
        <p className="text-sm text-muted-foreground">Registro de auditoria de materiais, campanhas, aprovações e publicações.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {q.data?.map((h) => (
              <div key={h.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{h.entity_type}</Badge>
                  <span className="font-mono text-xs">{h.event}</span>
                  <span className="text-muted-foreground">{h.entity_id?.slice(0, 8)}</span>
                </div>
                <div className="text-muted-foreground text-xs">{new Date(h.created_at).toLocaleString()}</div>
              </div>
            ))}
            {q.data?.length === 0 && <p className="p-6 text-center text-muted-foreground">Sem eventos.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
