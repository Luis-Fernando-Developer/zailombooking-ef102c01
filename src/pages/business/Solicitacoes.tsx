import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Inbox, History, Settings as SettingsIcon } from "lucide-react";
import {
  fetchRequests, isFinal, SolicitacaoRow, REQUEST_TYPE_LABELS,
} from "@/lib/api/requests";
import { RequestList } from "@/components/business/requests/RequestList";
import { RequestDetailDrawer } from "@/components/business/requests/RequestDetailDrawer";
import { NewAbsenceRequestDialog } from "@/components/business/requests/NewAbsenceRequestDialog";
import { ApprovalRulesPanel } from "@/components/business/requests/ApprovalRulesPanel";

export default function Solicitacoes() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [company, setCompany] = useState<{ id: string; name: string; slug: string; owner_email: string } | null>(null);
  const [employee, setEmployee] = useState<{ id: string; role: string } | null>(null);
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<SolicitacaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SolicitacaoRow | null>(null);
  const [open, setOpen] = useState(false);

  const role = useMemo(() => {
    if (!company || !user) return "employee";
    if ((company.owner_email || "").toLowerCase() === (user.email || "").toLowerCase()) return "owner";
    return employee?.role || "employee";
  }, [company, user, employee]);

  const canDecide = ["owner", "manager"].includes(role);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [slug]);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);
      const { data: c, error: ce } = await supabase
        .from("companies").select("id, name, slug, owner_email").eq("slug", slug).single();
      if (ce) throw ce;
      setCompany(c as any);

      if (u) {
        const { data: emp } = await supabase
          .from("employees").select("id, role").eq("company_id", c.id).eq("user_id", u.id).maybeSingle();
        setEmployee(emp as any);
      }

      const list = await fetchRequests(c.id);
      setRows(list);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const pending = rows.filter((r) => !isFinal(r.status));
  const history = rows.filter((r) => isFinal(r.status));

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <BusinessLayout
      companySlug={company.slug}
      companyName={company.name}
      companyId={company.id}
      userRole={role}
      currentUser={user}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gradient">Solicitações</h1>
            <p className="text-sm text-muted-foreground">
              Aprove, rejeite ou acompanhe pedidos da equipe.
            </p>
          </div>
          <div className="flex gap-2">
            <NewAbsenceRequestDialog
              tenantId={company.id}
              employeeId={employee?.id ?? null}
              onCreated={load}
            />
          </div>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending"><Inbox className="w-4 h-4 mr-1" /> Pendentes ({pending.length})</TabsTrigger>
            <TabsTrigger value="history"><History className="w-4 h-4 mr-1" /> Histórico ({history.length})</TabsTrigger>
            {role === "owner" || role === "manager" ? (
              <TabsTrigger value="settings"><SettingsIcon className="w-4 h-4 mr-1" /> Configurações</TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Aguardando decisão</CardTitle></CardHeader>
              <CardContent>
                <RequestList
                  rows={pending}
                  loading={loading}
                  onOpen={(r) => { setSelected(r); setOpen(true); }}
                  emptyText="Nenhuma solicitação pendente."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Resolvidas</CardTitle></CardHeader>
              <CardContent>
                <RequestList
                  rows={history}
                  loading={loading}
                  onOpen={(r) => { setSelected(r); setOpen(true); }}
                  emptyText="Sem histórico ainda."
                />
              </CardContent>
            </Card>
          </TabsContent>

          {(role === "owner" || role === "manager") && (
            <TabsContent value="settings" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Regras de aprovação</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Defina quem pode aprovar cada tipo de solicitação. Tipos conhecidos:{" "}
                    {Object.values(REQUEST_TYPE_LABELS).join(", ")}.
                  </p>
                </CardHeader>
                <CardContent>
                  <ApprovalRulesPanel tenantId={company.id} />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        <RequestDetailDrawer
          request={selected}
          open={open}
          onOpenChange={setOpen}
          canDecide={canDecide}
          currentUserId={user?.id}
          onChanged={load}
        />
      </div>
    </BusinessLayout>
  );
}
