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

interface Service {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  name: string;
  first_name?: string | null;
  second_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  email: string;
  phone?: string;
  role: string;
  employee_type: string;
  is_active: boolean;
  avatar_url?: string;
  system_profile_id?: string | null;
  base_occupation_id?: string | null;
  internal_job_title?: string | null;
  payout_flow_override?: string | null;
}

interface SystemProfile { id: string; code: string; name: string; }
interface BaseOccupation { id: string; name: string; company_id: string | null; }

interface EditEmployeeDialogProps {
  employee: Employee | null;
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmployeeUpdated: () => void;
}

export function EditEmployeeDialog({ employee, companyId, open, onOpenChange, onEmployeeUpdated }: EditEmployeeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [employeeServices, setEmployeeServices] = useState<string[]>([]);
  const [systemProfiles, setSystemProfiles] = useState<SystemProfile[]>([]);
  const [occupations, setOccupations] = useState<BaseOccupation[]>([]);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    first_name: "",
    second_name: "",
    last_name: "",
    nickname: "",
    email: "",
    phone: "",
    role: "employee" as string,
    employee_type: "fixo" as string,
    is_active: true,
    services: [] as string[],
    system_profile_id: "",
    base_occupation_id: "",
    internal_job_title: "",
    payout_flow_override: "" as "" | "via_company" | "direct_to_autonomous",
  });

  useEffect(() => {
    if (open && employee) {
      const fallback = splitFullName(employee.name || "");
      setFormData({
        first_name: employee.first_name ?? fallback.first_name,
        second_name: employee.second_name ?? fallback.second_name,
        last_name: employee.last_name ?? fallback.last_name,
        nickname: employee.nickname ?? "",
        email: employee.email,
        phone: employee.phone || "",
        role: employee.role as any,
        employee_type: employee.employee_type as any,
        is_active: employee.is_active,
        services: [],
        system_profile_id: employee.system_profile_id || "",
        base_occupation_id: employee.base_occupation_id || "",
        internal_job_title: employee.internal_job_title || "",
        payout_flow_override: (employee.payout_flow_override as any) || "",
      });
      fetchServices();
      fetchEmployeeServices();
      fetchSystemProfiles();
      fetchOccupations();
    }
  }, [open, employee, companyId]);

  const fetchSystemProfiles = async () => {
    const { data } = await supabase
      .from('system_profiles')
      .select('id, code, name')
      .eq('is_active', true)
      .order('sort_order');
    setSystemProfiles(data || []);
  };

  const fetchOccupations = async () => {
    const { data } = await supabase
      .from('base_occupations')
      .select('id, name, company_id')
      .eq('is_active', true)
      .or(`company_id.is.null,company_id.eq.${companyId}`)
      .order('name');
    setOccupations(data || []);
  };


  const fetchServices = async () => {
    try {
      const { data } = await supabase
        .from('services')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true);
      
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchEmployeeServices = async () => {
    if (!employee) return;
    
    try {
      const { data } = await supabase
        .from('employee_services')
        .select('service_id')
        .eq('employee_id', employee.id);
      
      const serviceIds = data?.map(es => es.service_id) || [];
      setEmployeeServices(serviceIds);
      setFormData(prev => ({ ...prev, services: serviceIds }));
    } catch (error) {
      console.error('Error fetching employee services:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;

    for (const [field, label] of [
      ["first_name", "Primeiro nome"],
      ["second_name", "Segundo nome"],
      ["last_name", "Sobrenome"],
    ] as const) {
      if (!validateNoSpaces((formData as any)[field])) {
        toast({
          title: `${label} inválido`,
          description: `${label} não pode conter espaços. Use apenas uma palavra.`,
          variant: "destructive",
        });
        return;
      }
    }

    const fullName = composeFullName(formData);
    if (!fullName) {
      toast({ title: "Nome obrigatório", description: "Informe ao menos o primeiro nome.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      // Atualizar dados do funcionário
      const { error: employeeError } = await supabase
        .from('employees')
        .update({
          name: fullName,
          first_name: formData.first_name || null,
          second_name: formData.second_name || null,
          last_name: formData.last_name || null,
          nickname: formData.nickname || null,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          employee_type: formData.employee_type,
          is_active: formData.is_active,
          system_profile_id: formData.system_profile_id || null,
          base_occupation_id: formData.base_occupation_id || null,
          internal_job_title: formData.internal_job_title || null,
          payout_flow_override: formData.employee_type === 'autonomo'
            ? (formData.payout_flow_override || null)
            : null,

        })
        .eq('id', employee.id);

      if (employeeError) throw employeeError;

      // Atualizar serviços vinculados
      // Primeiro, remover todos os serviços existentes
      const { error: deleteError } = await supabase
        .from('employee_services')
        .delete()
        .eq('employee_id', employee.id);

      if (deleteError) throw deleteError;

      // Adicionar novos serviços
      if (formData.services.length > 0) {
        const serviceInserts = formData.services.map(serviceId => ({
          employee_id: employee.id,
          service_id: serviceId
        }));

        const { error: servicesError } = await supabase
          .from('employee_services')
          .insert(serviceInserts);

        if (servicesError) throw servicesError;
      }

      toast({
        title: "Colaborador atualizado",
        description: "Os dados do colaborador foram atualizados com sucesso.",
      });

      onOpenChange(false);
      onEmployeeUpdated();
    } catch (error: any) {
      console.error('Error updating employee:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o colaborador.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Colaborador</DialogTitle>
          <DialogDescription>
            Edite as informações do colaborador
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">Primeiro nome *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData(prev => ({ ...prev, first_name: sanitizeNoSpaces(e.target.value) }))}
                placeholder="João"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="second_name">Segundo nome</Label>
              <Input
                id="second_name"
                value={formData.second_name}
                onChange={(e) => setFormData(prev => ({ ...prev, second_name: sanitizeNoSpaces(e.target.value) }))}
                placeholder="Pedro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Sobrenome</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData(prev => ({ ...prev, last_name: sanitizeNoSpaces(e.target.value) }))}
                placeholder="Silva"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">Cada campo aceita apenas uma palavra (sem espaços).</p>

          <div className="space-y-2">
            <Label htmlFor="nickname">Apelido</Label>
            <Input
              id="nickname"
              value={formData.nickname}
              onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
              placeholder="Ex: Jão"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="joao@exemplo.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função *</Label>
            <Select value={formData.role} onValueChange={(value: any) => setFormData(prev => ({ ...prev, role: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Colaborador</SelectItem>
                <SelectItem value="receptionist">Recepcionista</SelectItem>
                <SelectItem value="supervisor">Encarregado</SelectItem>
                <SelectItem value="manager">Gerente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="employee_type">Tipo de Funcionário *</Label>
            <Select value={formData.employee_type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, employee_type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Funcionário Fixo</SelectItem>
                <SelectItem value="autonomo">Funcionário Autônomo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="system_profile">Perfil do Sistema</Label>
            <Select
              value={formData.system_profile_id}
              onValueChange={(v) => setFormData(prev => ({ ...prev, system_profile_id: v }))}
            >
              <SelectTrigger id="system_profile">
                <SelectValue placeholder="Selecione o perfil" />
              </SelectTrigger>
              <SelectContent>
                {systemProfiles.map((sp) => (
                  <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base_occupation">Ocupação Base</Label>
            <Select
              value={formData.base_occupation_id}
              onValueChange={(v) => setFormData(prev => ({ ...prev, base_occupation_id: v }))}
            >
              <SelectTrigger id="base_occupation">
                <SelectValue placeholder="Selecione a ocupação" />
              </SelectTrigger>
              <SelectContent>
                {occupations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}{o.company_id === null ? "" : " (personalizada)"}
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
              onChange={(e) => setFormData(prev => ({ ...prev, internal_job_title: e.target.value }))}
              placeholder="Ex: Barbeiro Master, Gerente Unidade Centro"
            />
            <p className="text-xs text-muted-foreground">Campo livre — apenas organizacional/visual.</p>
          </div>



          <div className="space-y-3">
            <Label>Serviços Vinculados</Label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {services.map((service) => (
                <div key={service.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={service.id}
                    checked={formData.services.includes(service.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFormData(prev => ({ 
                          ...prev, 
                          services: [...prev.services, service.id] 
                        }));
                      } else {
                        setFormData(prev => ({ 
                          ...prev, 
                          services: prev.services.filter(s => s !== service.id) 
                        }));
                      }
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

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
            />
            <Label htmlFor="is_active">Colaborador ativo</Label>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}