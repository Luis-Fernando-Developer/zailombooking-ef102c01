import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchApprovalRules, upsertApprovalRule, REQUEST_TYPE_LABELS, ApprovalRule } from "@/lib/api/requests";

const ALL_ROLES = ["owner", "manager", "supervisor"] as const;
const KNOWN_TYPES = Object.keys(REQUEST_TYPE_LABELS);

export function ApprovalRulesPanel({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<Record<string, ApprovalRule | null>>({});
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);

  useEffect(() => {
    fetchApprovalRules(tenantId).then((list) => {
      const map: Record<string, ApprovalRule | null> = {};
      KNOWN_TYPES.forEach((t) => { map[t] = list.find((r) => r.request_type === t) ?? null; });
      setRules(map);
    }).finally(() => setLoading(false));
  }, [tenantId]);

  const toggle = (type: string, role: string) => {
    const cur = rules[type]?.approver_roles ?? ["owner", "manager"];
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    setRules({ ...rules, [type]: { ...(rules[type] ?? { id: "", tenant_id: tenantId, request_type: type, auto_apply: false }), approver_roles: next } as ApprovalRule });
  };

  const save = async (type: string) => {
    setSavingType(type);
    try {
      await upsertApprovalRule({
        tenant_id: tenantId,
        request_type: type,
        approver_roles: rules[type]?.approver_roles ?? ["owner", "manager"],
        auto_apply: rules[type]?.auto_apply ?? false,
      });
      toast({ title: "Regra salva" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingType(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando regras…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {KNOWN_TYPES.map((type) => {
        const approvers = rules[type]?.approver_roles ?? ["owner", "manager"];
        return (
          <Card key={type}>
            <CardHeader><CardTitle className="text-base">{REQUEST_TYPE_LABELS[type]}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Quem pode aprovar:</p>
              <div className="flex gap-4 flex-wrap">
                {ALL_ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm capitalize">
                    <Checkbox checked={approvers.includes(role)} onCheckedChange={() => toggle(type, role)} />
                    {role}
                  </label>
                ))}
              </div>
              <Button size="sm" onClick={() => save(type)} disabled={savingType === type}>Salvar</Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
