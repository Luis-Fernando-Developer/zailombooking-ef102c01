import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, User, Camera, Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface Company {
  id: string;
  name: string;
  slug: string;
}

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
  avatar_url?: string;
  created_at: string;
  is_active: boolean;
  company: Company;
}

export default function BusinessProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [employeeServices, setEmployeeServices] = useState<string[]>([]);
  const { toast } = useToast();

  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: "",
    is_active: false,
  });

  useEffect(() => {
    fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      // Buscar dados da empresa
      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .single();

      if (!companyData) return;

      // Buscar dados do funcionário
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: employeeData } = await supabase
        .from('employees')
        .select('*, company:companies(*)')
        .eq('user_id', user.id)
        .eq('company_id', companyData.id)
        .single();

      if (!employeeData) return;

      setEmployee(employeeData);
      setProfileData({
        name: employeeData.name || "",
        email: employeeData.email || "",
        phone: employeeData.phone || "",
        is_active: employeeData.is_active || false,
      });

      // Se for owner, buscar serviços disponíveis
      if (employeeData.role === 'owner') {
        const { data: servicesData } = await supabase
          .from('services')
          .select('id, name')
          .eq('company_id', companyData.id)
          .eq('is_active', true)
          .order('name');

        setServices(servicesData || []);

        // Buscar serviços vinculados ao employee
        const { data: employeeServicesData } = await supabase
          .from('employee_services')
          .select('service_id')
          .eq('employee_id', employeeData.id);

        setEmployeeServices(employeeServicesData?.map(es => es.service_id) || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados do perfil",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!employee) return;
    
    setSaving(true);
    try {
      // Atualizar dados do employee
      const { error } = await supabase
        .from('employees')
        .update({
          name: profileData.name,
          phone: profileData.phone,
          is_active: profileData.is_active,
        })
        .eq('id', employee.id);

      if (error) throw error;

      // Se for owner e estiver ativo, gerenciar serviços vinculados
      if (employee.role === 'owner' && profileData.is_active) {
        // Primeiro, deletar serviços existentes
        await supabase
          .from('employee_services')
          .delete()
          .eq('employee_id', employee.id);

        // Inserir novos serviços selecionados
        if (employeeServices.length > 0) {
          const servicesToInsert = employeeServices.map(serviceId => ({
            employee_id: employee.id,
            service_id: serviceId,
          }));

          const { error: servicesError } = await supabase
            .from('employee_services')
            .insert(servicesToInsert);

          if (servicesError) throw servicesError;
        }
      } else if (!profileData.is_active) {
        // Se não estiver ativo, remover todos os serviços vinculados
        await supabase
          .from('employee_services')
          .delete()
          .eq('employee_id', employee.id);
      }

      toast({
        title: "Sucesso",
        description: "Perfil atualizado com sucesso",
      });

      // Atualizar estado local
      setEmployee(prev => prev ? {
        ...prev,
        name: profileData.name,
        phone: profileData.phone,
        is_active: profileData.is_active,
      } : null);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar perfil",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleServiceToggle = (serviceId: string, checked: boolean) => {
    if (checked) {
      setEmployeeServices(prev => [...prev, serviceId]);
    } else {
      setEmployeeServices(prev => prev.filter(id => id !== serviceId));
    }
  };

  const getRoleBadge = (role: string) => {
    const roleNames = {
      owner: { label: "Proprietário", variant: "default" as const },
      admin: { label: "Administrador", variant: "secondary" as const },
      manager: { label: "Gerente", variant: "outline" as const },
      receptionist: { label: "Recepcionista", variant: "outline" as const },
      employee: { label: "Funcionário", variant: "outline" as const },
    };

    const roleInfo = roleNames[role as keyof typeof roleNames] || { label: role, variant: "outline" as const };
    return <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <BusinessLayout
        companySlug={slug || ""}
        companyName="Carregando..."
        companyId=""
        userRole="loading"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando...</p>
          </div>
        </div>
      </BusinessLayout>
    );
  }

  if (!employee) {
    return (
      <BusinessLayout
        companySlug={slug || ""}
        companyName="Acesso Negado"
        companyId=""
        userRole="unauthorized"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-destructive">Acesso Negado</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
          </div>
        </div>
      </BusinessLayout>
    );
  }

  return (
    <BusinessLayout
      companySlug={employee.company.slug}
      companyName={employee.company.name}
      companyId={employee.company.id}
      userRole={employee.role}
    >
      <div className="p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gradient">Meu Perfil</h1>
            <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
          </div>

          {/* Avatar e Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Foto e Informações Básicas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={employee.avatar_url} />
                    <AvatarFallback className="text-xl">
                      {getInitials(employee.name)}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute -bottom-2 -right-2 rounded-full p-2"
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">{employee.name}</h3>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(employee.role)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Membro desde {new Date(employee.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    value={profileData.name}
                    onChange={(e) => setProfileData(prev => ({...prev, name: e.target.value}))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    O email não pode ser alterado. Entre em contato com o administrador se necessário.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={profileData.phone}
                    onChange={(e) => setProfileData(prev => ({...prev, phone: e.target.value}))}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </CardContent>
          </Card>

          {/* Configurações de Profissional - Apenas para proprietários */}
          {employee.role === 'owner' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5" />
                  Configurações de Profissional
                </CardTitle>
                <CardDescription>
                  Configure se você atua como profissional realizando serviços
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="is-active">Profissional Ativo</Label>
                    <p className="text-sm text-muted-foreground">
                      Marque se você realiza atendimentos/procedimentos na empresa
                    </p>
                  </div>
                  <Switch
                    id="is-active"
                    checked={profileData.is_active}
                    onCheckedChange={(checked) => {
                      setProfileData(prev => ({ ...prev, is_active: checked }));
                      if (!checked) {
                        setEmployeeServices([]);
                      }
                    }}
                  />
                </div>

                {profileData.is_active && (
                  <div className="space-y-4">
                    <div>
                      <Label>Serviços Vinculados</Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        Selecione os serviços que você pode realizar
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      {services.map((service) => (
                        <div key={service.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={service.id}
                            checked={employeeServices.includes(service.id)}
                            onCheckedChange={(checked) => 
                              handleServiceToggle(service.id, checked as boolean)
                            }
                          />
                          <Label htmlFor={service.id} className="text-sm font-normal">
                            {service.name}
                          </Label>
                        </div>
                      ))}
                    </div>

                    {services.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Nenhum serviço cadastrado na empresa ainda.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Informações da Empresa */}
          <Card>
            <CardHeader>
              <CardTitle>Informações da Empresa</CardTitle>
              <CardDescription>
                Dados da empresa onde você trabalha
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Nome da Empresa</Label>
                  <p className="text-sm text-muted-foreground">{employee.company.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">URL da Empresa</Label>
                  <p className="text-sm text-muted-foreground">
                    {window.location.origin}/{employee.company.slug}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Seu Cargo</Label>
                  <div className="mt-1">
                    {getRoleBadge(employee.role)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BusinessLayout>
  );
}