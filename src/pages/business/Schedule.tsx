import { useState, useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { BusinessHoursConfig } from "@/components/business/schedule/BusinessHoursConfig";
import { EmployeeScheduleConfig } from "@/components/business/schedule/EmployeeScheduleConfig";
import { FixedEmployeesList } from "@/components/business/schedule/FixedEmployeesList";
import { AutonomousAvailabilityConfig } from "@/components/business/schedule/AutonomousAvailabilityConfig";
import { ScheduleRulesConfig } from "@/components/business/schedule/ScheduleRulesConfig";
import { AbsencesManager } from "@/components/business/schedule/AbsencesManager";
import { BlockedSlotsManager } from "@/components/business/schedule/BlockedSlotsManager";
import { SchedulesList } from "@/components/business/schedule/SchedulesList";
import { ScheduleTemplatesManager } from "@/components/business/schedule/ScheduleTemplatesManager";
import { ScheduleCycleConfig } from "@/components/business/schedule/ScheduleCycleConfig";
import { BreaksManager } from "@/components/business/schedule/BreaksManager";
import { Clock, Users, Calendar, Settings, UserX, Ban, CalendarRange, Coffee } from "lucide-react";

interface Company {
  id: string;
  name: string;
  slug: string;
}

export default function BusinessSchedule() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [company, setCompany] = useState<Company | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name, slug')
        .eq('slug', slug)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);

      const { data: employeeData } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', companyData.id)
        .eq('user_id', user.id)
        .maybeSingle();

      setCurrentEmployee(employeeData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Empresa não encontrada.</p>
      </div>
    );
  }

  // Determinar role/tipo (owner é detectado por email se não tiver registro em employees)
  const role: string = currentEmployee?.role || 'owner';
  const employeeType: string = currentEmployee?.employee_type || 'fixo';
  const isOwner = !currentEmployee; // sem registro em employees, é o owner
  const isManager = isOwner || role === 'owner' || role === 'manager';
  const isSupervisor = role === 'supervisor';
  const isReceptionist = role === 'receptionist';
  const isEmployee = role === 'employee';

  // employee só pode acessar Horários se for autônomo
  if (isEmployee && employeeType !== 'autonomo') {
    return <Navigate to={`/${company.slug}/admin/dashboard`} replace />;
  }

  // Visibilidade de cada aba
  const canSeeBusinessHours = isManager;
  const canSeeFixed = isManager || isSupervisor || isReceptionist;
  const canSeeAutonomous = isManager || isSupervisor || isReceptionist || (isEmployee && employeeType === 'autonomo');
  const canSeeAbsences = isManager || isSupervisor || isReceptionist;
  const canSeeBlocked = isManager || isSupervisor;
  const canSeeRules = isManager;
  const canSeeScales = isManager;
  const canSeeBreaks = isManager || isSupervisor;
  const canManageBreaks = isManager || isSupervisor;

  const defaultTab = canSeeBusinessHours
    ? 'business-hours'
    : canSeeAutonomous && isEmployee
    ? 'autonomous'
    : canSeeFixed
    ? 'fixed-schedules'
    : 'autonomous';

  const visibleTabsCount = [canSeeBusinessHours, canSeeFixed, canSeeAutonomous, canSeeAbsences, canSeeBlocked, canSeeScales, canSeeBreaks, canSeeRules].filter(Boolean).length;

  // Layout dedicado para Supervisor (Encarregado)
  if (isSupervisor) {
    return (
      <BusinessLayout
        companySlug={company.slug}
        companyName={company.name}
        companyId={company.id}
        userRole={role}
      >
        <div className="space-y-6 px-10 w-full py-8">
          <div>
            <h1 className="text-3xl font-bold text-gradient">Jornada dos Colaboradores</h1>
            <p className="text-muted-foreground mt-2">
              Configure a jornada de trabalho semanal para cada colaborador, incluindo horário de intervalo.
            </p>
          </div>

          <Tabs defaultValue="fixed-schedules" className="w-full">
            <TabsList className="grid lg:w-full items-center justify-center h-full" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
              <TabsTrigger value="fixed-schedules" className="flex items-center gap-2">
                <Users className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Fixos</span>
              </TabsTrigger>
              <TabsTrigger value="autonomous" className="flex items-center gap-2">
                <Calendar className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Autônomos</span>
              </TabsTrigger>
              <TabsTrigger value="absences" className="flex items-center gap-2">
                <UserX className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Ausências</span>
              </TabsTrigger>
              <TabsTrigger value="blocked" className="flex items-center gap-2">
                <Ban className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Bloqueios</span>
              </TabsTrigger>
              <TabsTrigger value="scales" className="flex items-center gap-2">
                <Settings className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Escalas</span>
              </TabsTrigger>
              <TabsTrigger value="breaks" className="flex items-center gap-2">
                <Coffee className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Intervalos</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fixed-schedules" className="mt-6">
              <FixedEmployeesList companyId={company.id} />
            </TabsContent>
            <TabsContent value="autonomous" className="mt-6">
              <AutonomousAvailabilityConfig companyId={company.id} readOnly={false} />
            </TabsContent>
            <TabsContent value="absences" className="mt-6">
              <AbsencesManager companyId={company.id} />
            </TabsContent>
            <TabsContent value="blocked" className="mt-6">
              <BlockedSlotsManager companyId={company.id} />
            </TabsContent>
            <TabsContent value="scales" className="mt-6">
              <SchedulesList tenantId={company.id} canManage={true} />
            </TabsContent>
            <TabsContent value="breaks" className="mt-6">
              <BreaksManager companyId={company.id} canManage={true} />
            </TabsContent>
          </Tabs>
        </div>
      </BusinessLayout>
    );
  }

  return (
    <BusinessLayout 
      companySlug={company.slug} 
      companyName={company.name}
      companyId={company.id}
      userRole={role}
    >
      <div className="space-y-6 px-10 w-full py-8"> 
        <div className="">
          <h1 className="text-3xl font-bold text-gradient">Horários e Disponibilidade</h1>
          <p className="text-muted-foreground mt-2">
            Configure horários de funcionamento, jornadas e ausências
          </p>
        </div>

        <Tabs defaultValue={defaultTab} className="w-full ">
          <TabsList className={`grid lg:w-full items-center justify-center h-full`} style={{ gridTemplateColumns: `repeat(${visibleTabsCount}, minmax(0, 1fr))` }}>
            {canSeeBusinessHours && (
              <TabsTrigger value="business-hours" className=" flex items-end justify-center h-full px-2 py-0 gap-2">
                <Clock className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Estabelecimento</span>
              </TabsTrigger>
            )}
            {canSeeFixed && (
              <TabsTrigger value="fixed-schedules" className="flex items-center gap-2">
                <Users className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Fixos</span>
              </TabsTrigger>
            )}
            {canSeeAutonomous && (
              <TabsTrigger value="autonomous" className="flex items-center gap-2">
                <Calendar className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Autônomos</span>
              </TabsTrigger>
            )}
            {canSeeAbsences && (
              <TabsTrigger value="absences" className="flex items-center gap-2">
                <UserX className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Ausências</span>
              </TabsTrigger>
            )}
            {canSeeBlocked && (
              <TabsTrigger value="blocked" className="flex items-center gap-2">
                <Ban className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Bloqueios</span>
              </TabsTrigger>
            )}
            {canSeeScales && (
              <TabsTrigger value="scales" className="flex items-center gap-2">
                <CalendarRange className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Escalas</span>
              </TabsTrigger>
            )}
            {canSeeRules && (
              <TabsTrigger value="rules" className="flex items-center gap-2">
                <Settings className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Regras</span>
              </TabsTrigger>
            )}
          </TabsList>

          {canSeeBusinessHours && (
            <TabsContent value="business-hours" className="mt-6">
              <BusinessHoursConfig companyId={company.id} />
            </TabsContent>
          )}

          {canSeeFixed && (
            <TabsContent value="fixed-schedules" className="mt-6">
              <FixedEmployeesList companyId={company.id} />
            </TabsContent>
          )}

          {canSeeAutonomous && (
            <TabsContent value="autonomous" className="mt-6">
              <AutonomousAvailabilityConfig
                companyId={company.id}
                restrictToEmployeeId={isEmployee ? currentEmployee?.id : undefined}
                readOnly={isReceptionist}
              />
            </TabsContent>
          )}

          {canSeeAbsences && (
            <TabsContent value="absences" className="mt-6">
              <AbsencesManager companyId={company.id} />
            </TabsContent>
          )}

          {canSeeBlocked && (
            <TabsContent value="blocked" className="mt-6">
              <BlockedSlotsManager
                companyId={company.id}
              />
            </TabsContent>
          )}

          {canSeeScales && (
            <TabsContent value="scales" className="mt-6 space-y-6">
              <ScheduleCycleConfig tenantId={company.id} />
              <ScheduleTemplatesManager tenantId={company.id} />
              <SchedulesList tenantId={company.id} canManage={true} />
            </TabsContent>
          )}

          {canSeeRules && (
            <TabsContent value="rules" className="mt-6">
              <ScheduleRulesConfig companyId={company.id} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </BusinessLayout>
  );
}
