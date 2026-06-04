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

interface Service {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  employee_type: string;
  is_active: boolean;
  avatar_url?: string;
}

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
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "employee" as const,
    employee_type: "fixo" as const,
    is_active: true,
    services: [] as string[]
  });

  useEffect(() => {
    if (open && employee) {
      setFormData({
        name: employee.name,
        email: employee.email,
        phone: employee.phone || "",
        role: employee.role as any,
        employee_type: employee.employee_type as any,
        is_active: employee.is_active,
        services: []
      });
      fetchServices();
      fetchEmployeeServices();
    }
  }, [open, employee, companyId]);

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
    
    setLoading(true);

    try {
      // Atualizar dados do funcionário
      const { error: employeeError } = await supabase
        .from('employees')
        .update({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          employee_type: formData.employee_type,
          is_active: formData.is_active
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
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: João Silva"
              required
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