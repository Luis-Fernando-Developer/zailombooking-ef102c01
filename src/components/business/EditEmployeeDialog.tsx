import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { composeFullName, sanitizeNoSpaces, splitFullName, validateNoSpaces } from "@/lib/employeeName";
import { BriefcaseBusiness, Contact, Handshake, InfoIcon, Package2Icon, Plug, ShieldCheck, User2 } from "lucide-react";

interface Service { id: string; name: string; }
interface Permission { id: string; code: string; name: string; description: string | null; module: string; sort_order: number; }
interface PermissionPreset { id: string; code: string; name: string; description: string | null; sort_order: number; }
interface Employee {
  id: string; name: string; first_name?: string | null; second_name?: string | null; last_name?: string | null; nickname?: string | null;
  email: string; phone?: string; role: string; employee_type: string; is_active: boolean; avatar_url?: string;
  system_profile_id?: string | null; base_occupation_id?: string | null; internal_job_title?: string | null;
  payout_flow_override?: string | null; termination_effective_date?: string | null; termination_reason?: string | null;
}
interface SystemProfile { id: string; code: string; name: string; }
interface BaseOccupation { id: string; name: string; company_id: string | null; }

const MODULE_LABELS: Record<string, string> = {
  employees: "Funcionários", services: "Serviços", bookings: "Agendamentos", clients: "Clientes", reports: "Relatórios",
  dashboard: "Dashboard", settings: "Configurações", subscription: "Assinatura", reallocation: "Realocação", chat: "Chat",
  marketing: "Marketing", chatbot: "Chatbot", whatsapp: "WhatsApp", finance: "Financeiro", schedules: "Horários",
};

interface EditEmployeeDialogProps { employee: Employee | null; companyId: string; open: boolean; onOpenChange: (open: boolean) => void; onEmployeeUpdated: () => void; }

export function EditEmployeeDialog({ employee, companyId, open, onOpenChange, onEmployeeUpdated }: EditEmployeeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [employeeServices, setEmployeeServices] = useState<string[]>([]);
  const [systemProfiles, setSystemProfiles] = useState<SystemProfile[]>([]);
  const [occupations, setOccupations] = useState<BaseOccupation[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<Permission[]>([]);
  const [permissionPresets, setPermissionPresets] = useState<PermissionPreset[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const { toast } = useToast();
  const [formData, setFormData] = useState({ first_name: "", second_name: "", last_name: "", nickname: "", email: "", phone: "", role: "employee" as string, employee_type: "fixo" as string, is_active: true, services: [] as string[], system_profile_id: "", base_occupation_id: "", internal_job_title: "", payout_flow_override: "" as "" | "via_company" | "direct_to_autonomous", termination_effective_date: "", termination_reason: "" });

  useEffect(() => {
    if (open && employee) {
      const fallback = splitFullName(employee.name || "");
      setSelectedPermissions([]); setSelectedPreset("");
      setFormData({ first_name: employee.first_name ?? fallback.first_name, second_name: employee.second_name ?? fallback.second_name, last_name: employee.last_name ?? fallback.last_name, nickname: employee.nickname ?? "", email: employee.email, phone: employee.phone || "", role: employee.role as any, employee_type: employee.employee_type as any, is_active: employee.is_active, services: [], system_profile_id: employee.system_profile_id || "", base_occupation_id: employee.base_occupation_id || "", internal_job_title: employee.internal_job_title || "", payout_flow_override: (employee.payout_flow_override as any) || "", termination_effective_date: employee.termination_effective_date || "", termination_reason: employee.termination_reason || "" });
      fetchServices(); fetchEmployeeServices(); fetchSystemProfiles(); fetchOccupations(); fetchPermissions(); fetchEmployeePermissions();
    }
  }, [open, employee, companyId]);

  const fetchSystemProfiles = async () => { const { data } = await supabase.from('system_profiles').select('id, code, name').eq('is_active', true).order('sort_order'); setSystemProfiles(data || []); };
  const fetchOccupations = async () => { const { data } = await supabase.from('base_occupations').select('id, name, company_id').eq('is_active', true).or(`company_id.is.null,company_id.eq.${companyId}`).order('name'); setOccupations(data || []); };
  const fetchServices = async () => { try { const { data } = await supabase.from('services').select('id, name').eq('company_id', companyId).eq('is_active', true); setServices(data || []); } catch (error) { console.error('Error fetching services:', error); } };
  const fetchEmployeeServices = async () => { if (!employee) return; try { const { data } = await supabase.from('employee_services').select('service_id').eq('employee_id', employee.id); const serviceIds = data?.map(es => es.service_id) || []; setEmployeeServices(serviceIds); setFormData(prev => ({ ...prev, services: serviceIds })); } catch (error) { console.error('Error fetching employee services:', error); } };
  const fetchPermissions = async () => {
    try {
      const [{ data: permissions, error: permissionsError }, { data: presets, error: presetsError }] = await Promise.all([
        supabase.from('permissions').select('id, code, name, description, module, sort_order').eq('is_active', true).order('module').order('sort_order'),
        supabase.from('permission_presets').select('id, code, name, description, sort_order').eq('is_active', true).order('sort_order'),
      ]);
      if (permissionsError) throw permissionsError; if (presetsError) throw presetsError;
      setPermissionsCatalog(permissions || []); setPermissionPresets(presets || []);
    } catch (error) { console.error('Error fetching permission catalog:', error); toast({ title: "Erro ao carregar permissões", description: "Não foi possível carregar o catálogo de permissões.", variant: "destructive" }); }
  };
  const fetchEmployeePermissions = async () => { if (!employee) return; try { const { data, error } = await supabase.from('employee_permissions').select('permission_id').eq('employee_id', employee.id); if (error) throw error; setSelectedPermissions((data || []).map(item => item.permission_id)); } catch (error) { console.error('Error fetching employee permissions:', error); toast({ title: "Erro ao carregar permissões", description: "Não foi possível carregar as permissões atuais do colaborador.", variant: "destructive" }); } };
  const handlePresetChange = async (presetId: string) => { setSelectedPreset(presetId); if (!presetId) { setSelectedPermissions([]); return; } const { data, error } = await supabase.from('permission_preset_items').select('permission_id').eq('preset_id', presetId); if (error) { console.error('Error fetching preset permissions:', error); toast({ title: "Erro ao carregar preset", description: "Não foi possível carregar as permissões do preset.", variant: "destructive" }); return; } setSelectedPermissions((data || []).map(item => item.permission_id)); };
  const togglePermission = (permissionId: string, checked: boolean) => { setSelectedPermissions(prev => checked ? (prev.includes(permissionId) ? prev : [...prev, permissionId]) : prev.filter(id => id !== permissionId)); setSelectedPreset(""); };
  const groupedPermissions = permissionsCatalog.reduce<Record<string, Permission[]>>((groups, permission) => { if (!groups[permission.module]) groups[permission.module] = []; groups[permission.module].push(permission); return groups; }, {});
  const getModuleState = (permissions: Permission[]): boolean | "indeterminate" => { const selectedCount = permissions.filter(permission => selectedPermissions.includes(permission.id)).length; if (selectedCount === 0) return false; if (selectedCount === permissions.length) return true; return "indeterminate"; };
  const toggleModulePermissions = (permissions: Permission[]) => { const moduleState = getModuleState(permissions); const shouldSelectAll = moduleState !== true; setSelectedPermissions(prev => { const moduleIds = new Set(permissions.map(permission => permission.id)); if (shouldSelectAll) return [...prev.filter(id => !moduleIds.has(id)), ...permissions.map(permission => permission.id)]; return prev.filter(id => !moduleIds.has(id)); }); setSelectedPreset(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!employee) return;
    for (const [field, label] of [["first_name", "Primeiro nome"], ["second_name", "Segundo nome"], ["last_name", "Sobrenome"]] as const) { if (!validateNoSpaces((formData as any)[field])) { toast({ title: `${label} inválido`, description: `${label} não pode conter espaços. Use apenas uma palavra.`, variant: "destructive" }); return; } }
    const fullName = composeFullName(formData); if (!fullName) { toast({ title: "Nome obrigatório", description: "Informe ao menos o primeiro nome.", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const { error: employeeError } = await supabase.from('employees').update({ name: fullName, first_name: formData.first_name || null, second_name: formData.second_name || null, last_name: formData.last_name || null, nickname: formData.nickname || null, email: formData.email, phone: formData.phone, role: formData.role, employee_type: formData.employee_type, is_active: formData.is_active, system_profile_id: formData.system_profile_id || null, base_occupation_id: formData.base_occupation_id || null, internal_job_title: formData.internal_job_title || null, payout_flow_override: formData.employee_type === 'autonomo' ? (formData.payout_flow_override || null) : null, termination_effective_date: formData.termination_effective_date || null, termination_reason: formData.termination_reason || null }).eq('id', employee.id);
      if (employeeError) throw employeeError;
      const { error: deleteError } = await supabase.from('employee_services').delete().eq('employee_id', employee.id); if (deleteError) throw deleteError;
      if (formData.services.length > 0) { const serviceInserts = formData.services.map(serviceId => ({ employee_id: employee.id, service_id: serviceId })); const { error: servicesError } = await supabase.from('employee_services').insert(serviceInserts); if (servicesError) throw servicesError; }
      const { error: permissionsError } = await supabase.rpc('update_employee_permissions', {
        p_target_employee_id: employee.id,
        p_permission_ids: selectedPermissions,
      });
      if (permissionsError) throw permissionsError;
      toast({ title: "Colaborador atualizado", description: "Os dados do colaborador foram atualizados com sucesso." }); onOpenChange(false); onEmployeeUpdated();
    } catch (error: any) { console.error('Error updating employee:', error); toast({ title: "Erro", description: "Não foi possível atualizar o colaborador.", variant: "destructive" }); } finally { setLoading(false); }
  };

  if (!employee) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90%] flex flex-col overflow-hidden p-0">
        {/* <div className='overflow-y-auto h-full '> */}

          <DialogHeader className="sticky left-0 px-6  h-44 top-0 py-6 bg-background border-b">
            <DialogTitle>Editar Colaborador</DialogTitle>
            <DialogDescription>Edite as informações do colaborador</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="!m-0 flex p-0 border-none overflow-y-auto">
           <div className='overflow-y-auto pl-6 pr-4 py-6 gap-3 flex flex-col h-full'>

            <div className="flex space-x-2 items-center">
              <User2 className="w-6 h-6 text-muted-foreground" />
              <p className="text-lg font-semibold uppercase">Perfil</p>
            </div>
            <div className="space-y-3 border border-border rounded-md p-3 bg-slate-400/10">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Primeiro nome *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        first_name: sanitizeNoSpaces(e.target.value),
                      }))
                    }
                    placeholder="João"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="second_name">Segundo nome</Label>
                  <Input
                    id="second_name"
                    value={formData.second_name}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        second_name: sanitizeNoSpaces(e.target.value),
                      }))
                    }
                    placeholder="Pedro"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Sobrenome</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        last_name: sanitizeNoSpaces(e.target.value),
                      }))
                    }
                    placeholder="Silva"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 text-muted-foreground text-sm">
                <InfoIcon className="w-5 h-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground ">
                  Cada campo aceita apenas uma palavra (sem espaços).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">Apelido</Label>
                <Input
                  id="nickname"
                  value={formData.nickname}
                  onChange={(e) => setFormData((prev) => ({ ...prev, nickname: e.target.value }))}
                  placeholder="Como prefere ser chamado"
                />
              </div>
            </div>
            <div className="flex space-x-2 items-center">
              <Contact className="w-6 h-6 text-muted-foreground" />
              <p className="text-lg font-semibold uppercase">Contato</p>
            </div>
            <div className="space-y-3 border border-border rounded-md p-3 bg-slate-400/10">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div className="flex space-x-2 items-center">
              <BriefcaseBusiness className="w-6 h-6 text-muted-foreground" />
              <p className="text-lg font-semibold uppercase">Profissão</p>
            </div>
            <div className="space-y-3 border border-border rounded-md p-3 bg-slate-400/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role">Função</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, role: v }))}
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Colaborador</SelectItem>
                      <SelectItem value="manager">Gerente</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee_type">Tipo de colaborador</Label>
                  <Select
                    value={formData.employee_type}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, employee_type: v }))}
                  >
                    <SelectTrigger id="employee_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixo">Fixo</SelectItem>
                      <SelectItem value="autonomo">Autônomo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {formData.employee_type === "autonomo" && (
                <div className="space-y-2">
                  <Label htmlFor="payout_flow_override">Fluxo de pagamento</Label>
                  <Select
                    value={formData.payout_flow_override || "__default__"}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        payout_flow_override: v === "__default__" ? "" : (v as any),
                      }))
                    }
                  >
                    <SelectTrigger id="payout_flow_override">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Usar padrão da empresa</SelectItem>
                      <SelectItem value="via_company">Empresa recebe e repassa</SelectItem>
                      <SelectItem value="direct_to_autonomous">Autônomo recebe e repassa</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Define para qual conta vai o pagamento do cliente neste profissional.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="system_profile">Perfil do Sistema</Label>
                <Select
                  value={formData.system_profile_id}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, system_profile_id: v }))}
                >
                  <SelectTrigger id="system_profile">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {systemProfiles.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="base_occupation">Ocupação Base</Label>
                <Select
                  value={formData.base_occupation_id}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, base_occupation_id: v }))}
                >
                  <SelectTrigger id="base_occupation">
                    <SelectValue placeholder="Selecione a ocupação" />
                  </SelectTrigger>
                  <SelectContent>
                    {occupations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                        {o.company_id === null ? "" : " (personalizada)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal_job_title">Cargo Interno</Label>
                <Input
                  id="internal_job_title"
                  value={formData.internal_job_title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, internal_job_title: e.target.value }))
                  }
                  placeholder="Ex: Barbeiro Master, Gerente Unidade Centro"
                />
                <div className="flex items-center space-x-2 text-muted-foreground text-sm">
                  <InfoIcon className="w-5 h-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Campo livre — apenas organizacional/visual.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-2 items-center">
              <ShieldCheck className="w-6 h-6 text-muted-foreground" />
              <p className="text-lg font-semibold uppercase">Permissões</p>
            </div>
            <div className="space-y-3 border border-border rounded-md p-3 bg-slate-400/10">
              <div>
                <Label>Permissões de Acesso</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Defina manualmente o que este colaborador pode acessar. A função não altera estas
                  permissões automaticamente.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="permission_preset">Preset de permissões</Label>
                <Select value={selectedPreset} onValueChange={handlePresetChange}>
                  <SelectTrigger id="permission_preset">
                    <SelectValue placeholder="Selecione um preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {permissionPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto rounded-md border p-3">
                {Object.entries(groupedPermissions).map(([module, permissions]) => {
                  const moduleState = getModuleState(permissions);
                  return (
                    <div key={module} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-module-${module}`}
                          checked={moduleState}
                          onCheckedChange={() => toggleModulePermissions(permissions)}
                          aria-label={`Selecionar todas as permissões de ${MODULE_LABELS[module] || module}`}
                        />
                        <Label
                          htmlFor={`edit-module-${module}`}
                          className="text-sm font-medium leading-tight cursor-pointer"
                        >
                          {MODULE_LABELS[module] || module}
                        </Label>
                      </div>
                      <div className="space-y-2 pl-6">
                        {permissions.map((permission) => (
                          <div key={permission.id} className="flex items-start space-x-2">
                            <Checkbox
                              id={`edit-permission-${permission.id}`}
                              checked={selectedPermissions.includes(permission.id)}
                              onCheckedChange={(checked) =>
                                togglePermission(permission.id, checked === true)
                              }
                            />
                            <Label
                              htmlFor={`edit-permission-${permission.id}`}
                              className="text-sm font-normal leading-tight cursor-pointer"
                            >
                              {permission.name}
                              {permission.description && (
                                <span className="block text-xs text-muted-foreground mt-0.5">
                                  {permission.description}
                                </span>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {permissionsCatalog.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma permissão cadastrada.</p>
                )}
              </div>
            </div>

            <div className="flex space-x-2 items-center">
              <Plug className="w-6 h-6 text-muted-foreground" />
              <p className="text-lg font-semibold uppercase">Vinculos</p>
            </div>
            <div className="space-y-3 border border-border rounded-md p-3 bg-slate-400/10">
              <div className="space-y-3">
                <Label>Serviços Vinculados</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {services.map((service) => (
                    <div key={service.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={service.id}
                        checked={formData.services.includes(service.id)}
                        onCheckedChange={(checked) => {
                          if (checked)
                            setFormData((prev) => ({
                              ...prev,
                              services: [...prev.services, service.id],
                            }));
                          else
                            setFormData((prev) => ({
                              ...prev,
                              services: prev.services.filter((s) => s !== service.id),
                            }));
                        }}
                      />
                      <Label htmlFor={service.id} className="text-sm font-normal">
                        {service.name}
                      </Label>
                    </div>
                  ))}
                  {services.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex space-x-2 items-center">
              <Handshake className="w-6 h-6 text-muted-foreground" />
              <p className="text-lg font-semibold uppercase">Contrato</p>
            </div>

            <div className="space-y-3 flex flex-col gap-3 border border-border rounded-md p-3 bg-slate-400/10">
              <div className="space-y-3 rounded-md border border-destructive/30 p-3">
                <div className=' gap-3 flex flex-col'>
                  <Label htmlFor="termination_effective_date" className="text-destructive">
                    Data de desligamento
                  </Label>
                  <div className='w-full'>
                    <Input
                      id="termination_effective_date"
                      className=' bg-white/50 flexm max-w-[92.4%] placeholder:text-destructive text-red-600'
                      placeholder="Selecione a data"
                      type="date"
                      value={formData.termination_effective_date}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, termination_effective_date: e.target.value }))
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    A partir desta data, todas as escalas futuras do colaborador serão marcadas como
                    Desligado (D) e ele deixa de aparecer na disponibilidade.
                  </p>
                </div>
                {formData.termination_effective_date && (
                  <div>
                    <Label htmlFor="termination_reason">Motivo (opcional)</Label>
                    <Input
                      id="termination_reason"
                      value={formData.termination_reason}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, termination_reason: e.target.value }))
                      }
                      placeholder="Ex: Pedido de demissão, fim de contrato..."
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label htmlFor="is_active">Colaborador ativo</Label>
              </div>
            </div>
            <div className="flex gap-4 pt-4 items-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
           </div>
          </form>
        {/* </div> */}
      </DialogContent>
    </Dialog>
  );
}
