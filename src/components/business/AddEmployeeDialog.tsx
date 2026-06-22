import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { composeFullName, sanitizeNoSpaces, validateNoSpaces } from "@/lib/employeeName";

interface Service {
  id: string;
  name: string;
}

interface SystemProfile { id: string; code: string; name: string; }
interface BaseOccupation { id: string; name: string; company_id: string | null; }

// Sugestão de ocupações relacionadas a cada perfil do sistema.
// Perfis ausentes ou listados como "*" exibem todas as ocupações.
const PROFILE_OCCUPATION_MAP: Record<string, string[] | "*"> = {
  OWNER: "*",
  GERENTE: "*",
  ENCARREGADO: "*",
  RH: ["Analista de RH", "Auxiliar Administrativo", "Gerente Administrativo"],
  FINANCEIRO: ["Contador", "Auxiliar Administrativo"],
  MARKETING: ["Consultor", "Auxiliar Administrativo"],
  RECEPCIONISTA: ["Recepcionista", "Secretária"],
  FAXINEIRO: ["Auxiliar de Limpeza"],
  PROFISSIONAL: [
    "Barbeiro","Cabeleireiro","Manicure","Pedicure","Designer de Sobrancelhas",
    "Esteticista","Massoterapeuta","Médico","Dentista","Psicólogo",
    "Nutricionista","Fisioterapeuta","Advogado","Contador","Consultor",
    "Mentor","Veterinário","Banhista/Tosador","Técnico de Manutenção","Professor",
  ],
  SEGURANCA: [],
  FISCAL: [],
  DESIGNER_GRAFICO: [],
};

interface AddEmployeeDialogProps {
  companyId: string;
  onEmployeeAdded: () => void;
}

export function AddEmployeeDialog({ companyId, onEmployeeAdded }: AddEmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [systemProfiles, setSystemProfiles] = useState<SystemProfile[]>([]);
  const [occupations, setOccupations] = useState<BaseOccupation[]>([]);
  const { toast } = useToast();
  const { guard } = usePlanLimits(companyId);
  
  const [formData, setFormData] = useState({
    first_name: "",
    second_name: "",
    last_name: "",
    nickname: "",
    email: "",
    phone: "",
    password: "",
    role: "employee" as const,
    employee_type: "fixo" as "fixo" | "autonomo",
    is_active: true,
    services: [] as string[],
    system_profile_id: "",
    base_occupation_id: "",
    internal_job_title: "",
  });

  useEffect(() => {
    if (open) {
      fetchServices();
      fetchSystemProfiles();
      fetchOccupations();
    }
  }, [open, companyId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.is_active && !(await guard("employees"))) return;
    setLoading(true);

    try {
      // Criar conta no Auth do Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            name: formData.name,
            phone: formData.phone
          }
        }
      });

      if (authError) throw authError;

      // Supabase retorna user "fake" (sem session e sem identities) quando
      // o email já está cadastrado, para não vazar a existência da conta.
      // Detectamos esse caso e abortamos antes de tentar criar o employee
      // (evita FK violation em employees.user_id → users).
      const identities = (authData.user as any)?.identities;
      if (!authData.user || (Array.isArray(identities) && identities.length === 0)) {
        toast({
          title: "Email já cadastrado",
          description: "Este email já possui uma conta no sistema. Use outro email.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      {
        // Criar registro do funcionário com user_id
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .insert([{
            company_id: companyId,
            user_id: authData.user.id,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            role: formData.role,
            employee_type: formData.employee_type,
            is_active: formData.is_active,
            system_profile_id: formData.system_profile_id || null,
            base_occupation_id: formData.base_occupation_id || null,
            internal_job_title: formData.internal_job_title || null,
          }])
          .select();

        if (employeeError) throw employeeError;

        // Vincular serviços ao funcionário
        if (employeeData && employeeData[0] && formData.services.length > 0) {
          const serviceInserts = formData.services.map(serviceId => ({
            employee_id: employeeData[0].id,
            service_id: serviceId
          }));

          const { error: servicesError } = await supabase
            .from('employee_services')
            .insert(serviceInserts);

          if (servicesError) throw servicesError;
        }
      }

      toast({
        title: "Colaborador adicionado",
        description: "O colaborador foi convidado com sucesso. Ele receberá um email para ativar a conta.",
      });

      // Resetar formulário
      setFormData({
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "employee",
        employee_type: "fixo",
        is_active: true,
        services: [],
        system_profile_id: "",
        base_occupation_id: "",
        internal_job_title: "",
      });


      setOpen(false);
      onEmployeeAdded();
    } catch (error: any) {
      console.error('Error creating employee:', error);
      
      // Verificar se é erro de email duplicado
      if (error?.code === '23505') {
        toast({
          title: "Email já cadastrado",
          description: "Este email já está cadastrado no sistema.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível adicionar o colaborador.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild  className=''>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Convidar Colaborador
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[380px] sm:min-w-[425px] max-h-[600px] overflow-y-auto ">
        <DialogHeader>
          <DialogTitle>Convidar Colaborador</DialogTitle>
          <DialogDescription>
            Adicione um novo colaborador à sua equipe
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 ">
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
            <Label htmlFor="password">Senha *</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="employee_type">Tipo de Colaborador *</Label>
            <Select value={formData.employee_type} onValueChange={(value: "fixo" | "autonomo") => setFormData(prev => ({ ...prev, employee_type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Funcionário Fixo</SelectItem>
                <SelectItem value="autonomo">Prestador de Serviço (Autônomo)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Fixos têm jornada definida pela empresa. Autônomos definem sua própria disponibilidade.
            </p>
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
            <Label htmlFor="system_profile">Perfil do Sistema</Label>
            <Select
              value={formData.system_profile_id}
              onValueChange={(v) => {
                const profile = systemProfiles.find(p => p.id === v);
                const allowed = profile ? PROFILE_OCCUPATION_MAP[profile.code] : undefined;
                const currentOcc = occupations.find(o => o.id === formData.base_occupation_id);
                let keepOcc = formData.base_occupation_id;
                if (currentOcc && allowed && allowed !== "*") {
                  if (!allowed.includes(currentOcc.name)) keepOcc = "";
                }
                setFormData(prev => ({ ...prev, system_profile_id: v, base_occupation_id: keepOcc }));
              }}
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
            <p className="text-xs text-muted-foreground">Define o conjunto de permissões (uso futuro).</p>
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
                {(() => {
                  const profile = systemProfiles.find(p => p.id === formData.system_profile_id);
                  const allowed = profile ? PROFILE_OCCUPATION_MAP[profile.code] : undefined;
                  const filtered = !allowed || allowed === "*"
                    ? occupations
                    : occupations.filter(o => allowed.includes(o.name) || o.company_id !== null);
                  if (filtered.length === 0) {
                    return <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma ocupação para este perfil</div>;
                  }
                  return filtered.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}{o.company_id === null ? "" : " (personalizada)"}
                    </SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Profissão ou ocupação principal.</p>
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
            <div className="space-y-2 max-h-40 overflow-y-auto">
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
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Enviando..." : "Enviar Convite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}