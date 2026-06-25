import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarOff, Plus, Trash2, AlertCircle } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

const ABSENCE_TYPES: Record<string, { label: string; tone: string }> = {
  vacation:   { label: "Férias",       tone: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  sick_leave: { label: "Atestado",     tone: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  leave:      { label: "Licença",      tone: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
  dayoff:     { label: "Folga extra",  tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  absence:    { label: "Ausência",     tone: "bg-muted text-muted-foreground border-border" },
};

interface Absence {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  absence_type: string;
  reason: string | null;
  employee?: { name: string };
}

export default function Ausencias() {
  const { slug } = useParams();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filterEmp, setFilterEmp] = useState<string>("");

  useEffect(() => { bootstrap(); /* eslint-disable-next-line */ }, [slug]);
  useEffect(() => { if (company?.id) load(); /* eslint-disable-next-line */ }, [company?.id, filterEmp]);

  async function bootstrap() {
    try {
      const { data: c } = await supabase.from("companies").select("*").eq("slug", slug).maybeSingle();
      if (!c) return;
      setCompany(c);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
        const { data: emp } = await supabase.from("employees").select("*").eq("user_id", user.id).maybeSingle();
        setEmployee(emp);
      }
      const { data: emps } = await supabase
        .from("employees").select("id, name").eq("company_id", c.id).order("name");
      setEmployees(emps || []);
    } finally { setLoading(false); }
  }

  async function load() {
    let q = supabase
      .from("employee_absences")
      .select(`id, employee_id, start_date, end_date, absence_type, reason,
               employee:employees(name)`)
      .eq("company_id", company.id)
      .gte("end_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: true });
    if (filterEmp) q = q.eq("employee_id", filterEmp);
    const { data, error } = await q;
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setAbsences((data as any) || []);
  }

  async function remove(id: string) {
    if (!confirm("Remover esta ausência?")) return;
    const { error } = await supabase.from("employee_absences").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ausência removida" });
    load();
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>;
  }
  if (!company || !employee) {
    return <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Acesso não autorizado.</p>
    </div>;
  }

  const canManage = ["owner", "manager", "supervisor"].includes(employee.role || "");

  return (
    <BusinessLayout
      companySlug={company.slug}
      companyName={company.name}
      companyId={company.id}
      userRole={employee.role}
      currentUser={currentUser}
    >
      <div className="p-4 md:p-6 space-y-6 w-full">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gradient flex items-center gap-2">
              <CalendarOff className="w-7 h-7" /> Ausências
            </h1>
            <p className="text-muted-foreground">
              Férias, atestados, licenças e folgas extras dos colaboradores.
            </p>
          </div>
          {canManage && (
            <Button variant="neon" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" /> Nova ausência
            </Button>
          )}
        </header>

        <Card>
          <CardHeader><CardTitle className="text-lg">Filtros</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-1 block">Profissional</Label>
              <Select value={filterEmp || "all"} onValueChange={(v) => setFilterEmp(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {absences.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Nenhuma ausência registrada para os filtros selecionados.
            </CardContent></Card>
          ) : absences.map((a) => {
            const t = ABSENCE_TYPES[a.absence_type] ?? ABSENCE_TYPES.absence;
            return (
              <Card key={a.id}>
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={t.tone}>{t.label}</Badge>
                      <span className="font-medium">{a.employee?.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(a.start_date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      {" "}→{" "}
                      {format(new Date(a.end_date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </p>
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {showAdd && (
          <AddAbsenceDialog
            companyId={company.id}
            employees={employees}
            onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); load(); }}
          />
        )}
      </div>
    </BusinessLayout>
  );
}

function AddAbsenceDialog({
  companyId, employees, onClose, onSaved,
}: {
  companyId: string;
  employees: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState("vacation");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!employeeId || !startDate || !endDate) {
      toast({ title: "Campos obrigatórios", description: "Profissional, início e fim são necessários.", variant: "destructive" });
      return;
    }
    if (endDate < startDate) {
      toast({ title: "Período inválido", description: "Data final deve ser ≥ data inicial.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_absences").insert({
        company_id: companyId,
        employee_id: employeeId,
        start_date: startDate,
        end_date: endDate,
        absence_type: type,
        reason: reason || null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast({ title: "Ausência registrada" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Falha ao salvar", variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova ausência</DialogTitle>
          <DialogDescription>
            Bloqueia a disponibilidade do colaborador no período informado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Profissional *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim *</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ABSENCE_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo (opcional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Férias programadas" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="neon" disabled={saving} onClick={save}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
