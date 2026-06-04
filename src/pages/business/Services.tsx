import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, DollarSign, Briefcase, Package, Gift } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { AddServiceDialog } from "@/components/business/AddServiceDialog";
import { EditServiceDialog } from "@/components/business/EditServiceDialog";
import { DeleteServiceDialog } from "@/components/business/DeleteServiceDialog";
import { ServiceComboDialog } from "@/components/business/ServiceComboDialog";
import { EditComboDialog } from "@/components/business/EditComboDialog";
import { DeleteComboDialog } from "@/components/business/DeleteComboDialog";
import { RewardsConfig } from "@/components/business/RewardsConfig";

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  image_url?: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Employee {
  id: string;
  role: string;
  company: Company;
}

interface Combo {
  id: string;
  name: string;
  description?: string;
  combo_price: number;
  original_total_price?: number;
  total_duration_minutes?: number;
  is_active?: boolean;
  items?: { service_id: string; service?: { id?: string; name?: string } }[];
}

export default function BusinessServices() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

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

      setCompany(companyData);

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

      // Buscar serviços
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('company_id', companyData.id)
        .order('name');

      setServices(servicesData || []);

      // Buscar combos
      const { data: combosData, error: combosError } = await supabase
        .from('service_combos')
        .select('*, items:service_combo_items(*)')
        .eq('company_id', companyData.id)
        .order('name');

      if (combosError) {
        console.error('Error fetching combos:', combosError);
      } else {
        // coletar ids de serviços e buscar nomes
        const serviceIds = Array.from(
          new Set(
            (combosData || [])
              .flatMap((c: any) => (c.items || []).map((it: any) => it.service_id))
              .filter(Boolean)
          )
        );

        let servicesMap: Record<string, any> = {};
        if (serviceIds.length > 0) {
          const { data: servicesList } = await supabase
            .from('services')
            .select('id, name')
            .in('id', serviceIds);
          servicesMap = (servicesList || []).reduce((acc: any, s: any) => {
            acc[s.id] = s;
            return acc;
          }, {});
        }

        // anexar service info aos items
        const combosWithServices = (combosData || []).map((c: any) => ({
          ...c,
          items: (c.items || []).map((it: any) => ({
            ...it,
            service: servicesMap[it.service_id] || null,
          })),
        }));
        setCombos(combosWithServices);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
    }
    return `${mins}min`;
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

  if (!company || !employee) {
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
      companySlug={company.slug}
      companyName={company.name}
      companyId={company.id}
      userRole={employee.role}
    >
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gradient">Serviços</h1>
            <p className="text-muted-foreground">Gerencie os serviços oferecidos pela sua empresa</p>
          </div>
          <div className="flex gap-2">
            <ServiceComboDialog companyId={company.id} onComboAdded={fetchData} />
            <AddServiceDialog companyId={company.id} onServiceAdded={fetchData} />
          </div>
        </div>

        <Tabs defaultValue="services" className="mb-6">
          <TabsList>
            <TabsTrigger value="services" className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Serviços
            </TabsTrigger>
            <TabsTrigger value="combos" className="flex items-center gap-2">
              <Package className="w-4 h-4" /> Combos
            </TabsTrigger>
            <TabsTrigger value="rewards" className="flex items-center gap-2">
              <Gift className="w-4 h-4" /> Brindes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services">

        {services.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Briefcase className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum serviço cadastrado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Comece criando seu primeiro serviço para que os clientes possam fazer agendamentos.
              </p>
              <AddServiceDialog 
                companyId={company.id} 
                onServiceAdded={fetchData}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <Card key={service.id} className="relative">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="flex items-center gap-2">
                      {service.name}
                      {!service.is_active && (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </CardTitle>
                    <div className="flex gap-1">
                      <EditServiceDialog 
                        service={service} 
                        onServiceUpdated={fetchData} 
                      />
                      <DeleteServiceDialog 
                        service={service} 
                        onServiceDeleted={fetchData} 
                      />
                    </div>
                  </div>
                  {service.description && (
                    <CardDescription>{service.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-primary" />
                      <span className="font-semibold">{formatPrice(service.price)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-primary" />
                      <span>{formatDuration(service.duration_minutes)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
          </TabsContent>

          <TabsContent value="combos">
            {combos.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Use o botão "Criar Combo" acima para combinar serviços</p>
                  </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {combos.map((combo) => (
                  <Card key={combo.id} className="relative">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <CardTitle className="flex items-center gap-2">
                          {combo.name}
                          {!combo.is_active && <Badge variant="secondary">Inativo</Badge>}
                        </CardTitle>
                        <div className="flex gap-1">
                          <EditComboDialog combo={combo} services={services} onComboUpdated={fetchData} />
                          <DeleteComboDialog combo={combo} onComboDeleted={fetchData} />
                        </div>
                      </div>
                      {combo.description && <CardDescription>{combo.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Preço do combo:</span>
                          <span className="font-semibold">{formatPrice(combo.combo_price)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Preço original:</span>
                          <span className="line-through text-muted-foreground">{formatPrice(combo.original_total_price || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duração:</span>
                          <span>{formatDuration(combo.total_duration_minutes || 0)}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs text-muted-foreground mb-2">Serviços inclusos:</p>
                          {combo.items?.map((it) => (
                            <div key={it.service_id} className="text-sm">
                              • {it.service?.name || 'Serviço não encontrado'}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rewards">
            <RewardsConfig companyId={company.id} />
          </TabsContent>
        </Tabs>
      </div>
    </BusinessLayout>
  );
}