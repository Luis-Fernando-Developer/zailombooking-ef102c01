import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, GripVertical, Building2, Users, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

type Sector = { id: string; name: string; description: string | null };
type Group = { id: string; sector_id: string; name: string; description: string | null };
type Employee = { id: string; name: string; role: string | null; is_active: boolean | null; termination_effective_date: string | null; org_group_id: string | null; org_position_id: string | null };
type OrgPosition = { id: string; group_id: string; name: string; max_members: number | null };
type PositionPermission = { position_id: string; permission_code: string; enabled: boolean };

export default function OrganizationalStructure() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<OrgPosition[]>([]);
  const [positionPermissions, setPositionPermissions] = useState<PositionPermission[]>([]);
  const [newPositions, setNewPositions] = useState<Record<string, string>>({});
  const [newSector, setNewSector] = useState("");
  const [newGroups, setNewGroups] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isAdmin = ["owner", "admin"].includes(String(currentEmployee?.role || "").toLowerCase());

  async function load() {
    setLoading(true);
    try {
      const { data: companyData, error: companyError } = await supabase.from("companies").select("id,name,slug").eq("slug", slug).single();
      if (companyError) throw companyError;
      setCompany(companyData);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão não encontrada.");
      const { data: employeeData, error: employeeError } = await supabase.from("employees").select("id,role").eq("company_id", companyData.id).eq("user_id", auth.user.id).maybeSingle();
      if (employeeError) throw employeeError;
      setCurrentEmployee(employeeData);
      const [sectorResult, groupResult, employeeResult, positionResult, permissionResult] = await Promise.all([
        supabase.from("company_sectors").select("id,name,description").eq("company_id", companyData.id).order("position").order("name"),
        supabase.from("company_groups").select("id,sector_id,name,description").eq("company_id", companyData.id).order("position").order("name"),
        supabase.from("employees").select("id,name,role,is_active,termination_effective_date,org_group_id,org_position_id").eq("company_id", companyData.id).order("name"),
        supabase.from("company_group_positions").select("id,group_id,name,max_members").eq("company_id", companyData.id).order("position").order("name"),
        supabase.from("company_group_position_permissions").select("position_id,permission_code,enabled").eq("company_id", companyData.id),
      ]);
      if (sectorResult.error) throw sectorResult.error;
      if (groupResult.error) throw groupResult.error;
      if (employeeResult.error) throw employeeResult.error;
      if (positionResult.error) throw positionResult.error;
      if (permissionResult.error) throw permissionResult.error;
      setSectors(sectorResult.data || []);
      setGroups(groupResult.data || []);
      setPositions(positionResult.data || []);
      setPositionPermissions(permissionResult.data || []);
      setEmployees((employeeResult.data || []).filter((e: Employee) => e.is_active !== false || (e.termination_effective_date && e.termination_effective_date > new Date().toISOString().slice(0, 10))));
    } catch (error: any) {
      toast({ title: "Erro ao carregar estrutura", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [slug]);

  async function createSector() {
    if (!company || !newSector.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("org_upsert_sector", { _company_id: company.id, _sector_id: null, _name: newSector.trim(), _description: null });
    setSaving(false);
    if (error) return toast({ title: "Não foi possível criar o setor", description: error.message, variant: "destructive" });
    setNewSector(""); await load();
  }

  async function createGroup(sectorId: string) {
    const name = (newGroups[sectorId] || "").trim();
    if (!company || !name) return;
    setSaving(true);
    const { error } = await supabase.rpc("org_upsert_group", { _company_id: company.id, _sector_id: sectorId, _group_id: null, _name: name, _description: null });
    setSaving(false);
    if (error) return toast({ title: "Não foi possível criar o grupo", description: error.message, variant: "destructive" });
    setNewGroups(prev => ({ ...prev, [sectorId]: "" })); await load();
  }

  async function renameSector(sector: Sector) {
    const name = window.prompt("Nome do setor", sector.name);
    if (!name?.trim() || !company) return;
    const { error } = await supabase.rpc("org_upsert_sector", { _company_id: company.id, _sector_id: sector.id, _name: name.trim(), _description: sector.description });
    if (error) toast({ title: "Erro ao renomear setor", description: error.message, variant: "destructive" });
    else await load();
  }

  async function renameGroup(group: Group) {
    const name = window.prompt("Nome do grupo", group.name);
    if (!name?.trim() || !company) return;
    const { error } = await supabase.rpc("org_upsert_group", { _company_id: company.id, _sector_id: group.sector_id, _group_id: group.id, _name: name.trim(), _description: group.description });
    if (error) toast({ title: "Erro ao renomear grupo", description: error.message, variant: "destructive" });
    else await load();
  }

  async function createPosition(groupId: string) {
    const name = (newPositions[groupId] || "").trim();
    if (!company || !name) return;
    const { error } = await supabase.rpc("org_upsert_group_position", { _company_id: company.id, _group_id: groupId, _position_id: null, _name: name, _max_members: null });
    if (error) return toast({ title: "Erro ao criar cargo", description: error.message, variant: "destructive" });
    setNewPositions(prev => ({ ...prev, [groupId]: "" }));
    await load();
  }

  async function togglePositionPermission(positionId: string, permissionCode: string, enabled: boolean) {
    if (!company || !isAdmin) return;
    const { error } = await supabase.rpc("org_set_position_permission", { _company_id: company.id, _position_id: positionId, _permission_code: permissionCode, _enabled: enabled });
    if (error) return toast({ title: "Erro ao salvar permissão", description: error.message, variant: "destructive" });
    setPositionPermissions(prev => {
      const old = prev.find(p => p.position_id === positionId && p.permission_code === permissionCode);
      return old
        ? prev.map(p => p === old ? { ...p, enabled } : p)
        : [...prev, { position_id: positionId, permission_code: permissionCode, enabled }];
    });
  }

  async function moveEmployee(employeeId: string, groupId: string, positionId: string | null = null) {
    if (!company) return;
    const employee = employees.find(e => e.id === employeeId);
    if (!employee || (employee.org_group_id === (groupId || null) && employee.org_position_id === positionId)) return;
    setSaving(true);
    const { error } = await supabase.rpc("org_move_employee", {
      _company_id: company.id, _employee_id: employeeId,
      _target_group_id: groupId || null, _target_position_id: positionId,
      _reason: "Movimentação pela estrutura organizacional",
    });
    setSaving(false);
    if (error) {
      toast({ title: "Movimentação não permitida", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Colaborador movimentado" });
    await load();
  }

  const groupedEmployees = (groupId: string) => employees.filter(e => e.org_group_id === groupId);
  const unassigned = employees.filter(e => !e.org_group_id);

  if (loading || !company) return <BusinessLayout companySlug={slug || ""} companyName={company?.name || "Carregando..."} companyId={company?.id} userRole={currentEmployee?.role || "loading"}><div className="p-8 text-muted-foreground">Carregando estrutura organizacional...</div></BusinessLayout>;

  return (
    <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={currentEmployee?.role || "employee"}>
      <div className="p-4 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div><h1 className="text-3xl font-bold">Estrutura organizacional</h1><p className="text-muted-foreground mt-1">Organize setores, grupos e colaboradores visualmente.</p></div>
          {isAdmin && <div className="flex gap-2 w-full md:w-auto"><Input value={newSector} onChange={e => setNewSector(e.target.value)} placeholder="Nome do novo setor" onKeyDown={e => e.key === "Enter" && createSector()} /><Button onClick={createSector} disabled={saving || !newSector.trim()}><Plus className="w-4 h-4 mr-2" />Criar setor</Button></div>}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {sectors.map(sector => (
            <Card key={sector.id} className="w-[340px] min-w-[340px] border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2"><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />{sector.name}</CardTitle>{isAdmin && <Button size="icon" variant="ghost" onClick={() => renameSector(sector)} aria-label="Renomear setor"><Pencil className="w-4 h-4" /></Button>}</div>
                <Badge variant="secondary" className="w-fit">{groups.filter(g => g.sector_id === sector.id).length} grupos</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {groups.filter(g => g.sector_id === sector.id).map(group => (
                  <div key={group.id} className="rounded-xl border bg-muted/30 p-3 space-y-2" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/employee-id"); if (id) moveEmployee(id, group.id); }}>
                    <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">{group.name}</h3>{isAdmin && <Button size="icon" variant="ghost" onClick={() => renameGroup(group)} aria-label="Renomear grupo"><Pencil className="w-3.5 h-3.5" /></Button>}</div>
                    <div className="space-y-2 min-h-10">
                      {groupedEmployees(group.id).map(employee => (
                        <div key={employee.id} draggable onDragStart={e => e.dataTransfer.setData("text/employee-id", employee.id)} className="rounded-lg bg-background border p-2 flex items-center gap-2 cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{employee.name}</p><p className="text-xs text-muted-foreground">{employee.role || "Colaborador"}</p></div>
                          <select aria-label={`Cargo organizacional de ${employee.name}`} className="max-w-[105px] rounded-md border bg-background px-1 py-1 text-xs" value={employee.org_position_id || ""} onChange={e => moveEmployee(employee.id, group.id, e.target.value || null)}>
                            <option value="">Sem cargo</option>
                            {positions.filter(p => p.group_id === group.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      ))}
                      {groupedEmployees(group.id).length === 0 && <p className="text-xs text-muted-foreground py-2">Arraste colaboradores para este grupo.</p>}
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cargos e permissões</p>
                      {positions.filter(p => p.group_id === group.id).map(position => (
                        <div key={position.id} className="rounded-md border bg-background p-2 space-y-2">
                          <p className="text-sm font-medium">{position.name}</p>
                          {isAdmin && <div className="flex flex-wrap gap-3 text-xs">
                            <label className="flex items-center gap-1"><input type="checkbox" checked={positionPermissions.some(p => p.position_id === position.id && p.permission_code === "org.manage_group_members" && p.enabled)} onChange={e => togglePositionPermission(position.id, "org.manage_group_members", e.target.checked)} />Gerenciar membros</label>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={positionPermissions.some(p => p.position_id === position.id && p.permission_code === "schedules.manage_group" && p.enabled)} onChange={e => togglePositionPermission(position.id, "schedules.manage_group", e.target.checked)} />Gerenciar escalas</label>
                          </div>}
                        </div>
                      ))}
                      {isAdmin && <div className="flex gap-2"><Input value={newPositions[group.id] || ""} onChange={e => setNewPositions(prev => ({ ...prev, [group.id]: e.target.value }))} placeholder="Novo cargo (ex.: Líder)" onKeyDown={e => e.key === "Enter" && createPosition(group.id)} /><Button size="icon" variant="outline" onClick={() => createPosition(group.id)} disabled={!((newPositions[group.id] || "").trim())}><Plus className="w-4 h-4" /></Button></div>}
                    </div>
                  </div>
                ))}
                {isAdmin && <div className="flex gap-2"><Input value={newGroups[sector.id] || ""} onChange={e => setNewGroups(prev => ({ ...prev, [sector.id]: e.target.value }))} placeholder="Novo grupo" onKeyDown={e => e.key === "Enter" && createGroup(sector.id)} /><Button size="icon" variant="outline" disabled={saving || !(newGroups[sector.id] || "").trim()} onClick={() => createGroup(sector.id)}><Plus className="w-4 h-4" /></Button></div>}
              </CardContent>
            </Card>
          ))}
          {sectors.length === 0 && <Card className="w-full"><CardContent className="p-8 text-center text-muted-foreground">Nenhum setor cadastrado. Crie o primeiro setor para começar.</CardContent></Card>}
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />Colaboradores sem grupo <Badge variant="secondary">{unassigned.length}</Badge></CardTitle></CardHeader>
          <CardContent><div className="flex flex-wrap gap-2 min-h-12" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/employee-id"); if (id && isAdmin) moveEmployee(id, ""); }}>
            {unassigned.map(employee => <div key={employee.id} draggable onDragStart={e => e.dataTransfer.setData("text/employee-id", employee.id)} className="rounded-lg border bg-background px-3 py-2 flex items-center gap-2 cursor-grab"><GripVertical className="w-4 h-4 text-muted-foreground" /><span className="text-sm">{employee.name}</span></div>)}
            {unassigned.length === 0 && <p className="text-sm text-muted-foreground">Todos os colaboradores ativos estão vinculados a um grupo.</p>}
          </div></CardContent>
        </Card>
        {saving && <p className="text-xs text-muted-foreground">Salvando alteração...</p>}
      </div>
    </BusinessLayout>
  );
}
