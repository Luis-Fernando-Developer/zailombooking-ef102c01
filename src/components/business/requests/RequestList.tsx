import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { REQUEST_TYPE_LABELS, PRIORITY_LABELS, SolicitacaoRow } from "@/lib/api/requests";

interface Props {
  rows: SolicitacaoRow[];
  loading?: boolean;
  onOpen: (row: SolicitacaoRow) => void;
  emptyText?: string;
}

export function RequestList({ rows, loading, onOpen, emptyText = "Nenhuma solicitação." }: Props) {
  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>;
  }
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{emptyText}</p>;
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Criada em</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.title}</TableCell>
              <TableCell className="text-muted-foreground">
                {REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {PRIORITY_LABELS[r.priority] ?? r.priority}
              </TableCell>
              <TableCell><RequestStatusBadge status={r.status} /></TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {format(new Date(r.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
              </TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" onClick={() => onOpen(r)}>
                  <Eye className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
