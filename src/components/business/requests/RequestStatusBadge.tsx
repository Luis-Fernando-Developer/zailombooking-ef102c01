import { Badge } from "@/components/ui/badge";
import { RequestStatus, STATUS_LABELS } from "@/lib/api/requests";

const VARIANT: Record<RequestStatus, { className: string }> = {
  pending: { className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  in_review: { className: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  approved: { className: "bg-green-500/15 text-green-500 border-green-500/30" },
  partially_approved: { className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  rejected: { className: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelled: { className: "bg-muted text-muted-foreground border-border" },
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const v = VARIANT[status] ?? VARIANT.pending;
  return (
    <Badge variant="outline" className={v.className}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
