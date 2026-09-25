import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
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
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setAuthUser(user);

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

  const { hasPermission, loading: permissionsLoading } = usePermissions(company?.id, authUser);

  if (loading || permissionsLoading) {
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

  const role: string = currentEmployee?.role || 'owner';
  const employeeType: string = currentEmployee?.employee_type || 'fixo';
  const isEmployee = role === 'employee';
  const isManager = role === 'owner' || role === 'admin' || role === 'manager' || !currentEmployee;
  const isSupervisor = role === 'supervisor';

  const canSeeBusinessHours = hasPermission('schedules.view_establishment');
  const canSeeFixed = hasPermission('schedules.view_fixed');
  const canSeeAutonomous = hasPermission('schedules.view_autonomous');
  const canSeeAbsences = hasPermission('schedules.view_absences');
  const canSeeBlocked = hasPermission('schedules.view_blocks');
  const canSeeScales = hasPermission('schedules.view_shifts');
  const canSeeBreaks = hasPermission('schedules.view_breaks');
  const canSeeRules = hasPermission('schedules.view_rules');

  const visibleTabsCount = [
    canSeeBusinessHours,
    canSeeFixed,
    canSeeAutonomous,
    canSeeAbsences,
    canSeeBlocked,
    canSeeScales,
    canSeeBreaks,
    canSeeRules,
  ].filter(Boolean).length;

  if (visibleTabsCount === 0) {
    return (
      <BusinessLayout
        companySlug={company.slug}
        companyName={company.name}
        companyId={company.id}
        userRole={role}
      >
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-destructive">Acesso Negado</h2>
            <p className="text-muted-foreground mt-2">Você não possui nenhuma permissão de acesso às abas de Horários.</p>
          </div>
        </div>
      </BusinessLayout>
    );
  }

  const defaultTab = canSeeBusinessHours
    ? 'business-hours'
    : canSeeFixed
    ? 'fixed-schedules'
    : canSeeAutonomous
    ? 'autonomous'
    : canSeeAbsences
    ? 'absences'
    : canSeeBlocked
    ? 'blocked'
    : canSeeScales
    ? 'scales'
    : canSeeBreaks
    ? 'breaks'
    : 'rules';

  const canManageBreaks = isManager || isSupervisor;

  return (
    <BusinessLayout
      companySlug={company.slug}
      companyName={company.name}
      companyId={company.id}
      userRole={role}
    >
      <div className="space-y-6 px-10 w-full py-8">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Horários e Disponibilidade</h1>
          <p className="text-muted-foreground mt-2">
            Configure horários de funcionamento, jornadas e ausências
          </p>
        </div>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid lg:w-full items-center justify-center h-full" style={{ gridTemplateColumns: `repeat(${visibleTabsCount}, minmax(0, 1fr))` }}>
            {canSeeBusinessHours && (
              <TabsTrigger value="business-hours" className="flex items-end justify-center h-full px-2 py-0 gap-2">
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
            {canSeeBreaks && (
              <TabsTrigger value="breaks" className="flex items-center gap-2">
                <Coffee className="w-4 h-full" />
                <span className="hidden sm:flex pt-0.5 sm:items-center sm:justify-center h-full">Intervalos</span>
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
                restrictToEmployeeId={isEmployee && employeeType === 'autonomo' ? currentEmployee?.id : undefined}
                readOnly={!(isEmployee && employeeType === 'autonomo')}
              />
            </TabsContent>
          )}

          {canSeeAbsences && (
            <TabsContent value="absences" className="mt-6">
              <AbsencesManager
                companyId={company.id}
                viewerRole={role}
                viewerEmployeeId={currentEmployee?.id}
              />
            </TabsContent>
          )}

          {canSeeBlocked && (
            <TabsContent value="blocked" className="mt-6">
              <BlockedSlotsManager companyId={company.id} />
            </TabsContent>
          )}

          {canSeeScales && (
            <TabsContent value="scales" className="mt-6 space-y-6">
              <ScheduleCycleConfig tenantId={company.id} />
              <ScheduleTemplatesManager tenantId={company.id} />
              <SchedulesList tenantId={company.id} canManage={isManager || isSupervisor} currentEmployeeId={currentEmployee?.id} />
            </TabsContent>
          )}

          {canSeeBreaks && (
            <TabsContent value="breaks" className="mt-6">
              <BreaksManager companyId={company.id} canManage={canManageBreaks} />
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
