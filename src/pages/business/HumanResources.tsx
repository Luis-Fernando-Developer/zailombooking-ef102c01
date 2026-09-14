import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Activity,
  Archive,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  HeartPulse,
  Users,
} from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";
import { usePermissions } from "@/hooks/use-permissions";

interface Company {
  id: string;
  name: string;
  slug: string;
  owner_id?: string | null;
}

interface Employee {
  id: string;
  name: string;
  role: string | null;
  is_active: boolean | null;
  created_at: string;
}

const hrModules = [
  { title: "Férias", description: "Organização, solicitações, aprovações e histórico de férias.", permission: "hr.manage_vacations", icon: CalendarDays },
  { title: "Afastamentos", description: "Registro e acompanhamento de afastamentos e ocorrências.", permission: "hr.manage_absences", icon: HeartPulse },
  { title: "Documentos", description: "Documentos administrativos e histórico documental dos colaboradores.", permission: "hr.manage_documents", icon: FileText },
  { title: "Jornada / Ponto", description: "Jornadas, escalas, ponto, horas extras e banco de horas.", permission: "hr.manage_attendance", icon: Clock3 },
  { title: "Avaliações", description: "Avaliações de desempenho, feedbacks e histórico profissional.", permission: "hr.manage_evaluations", icon: ClipboardList },
  { title: "Histórico", description: "Linha do tempo das principais alterações administrativas do colaborador.", permission: "hr.manage_employees", icon: Activity },
];

function roleLabel(role: string | null) {
  const labels: Record<string, string> = {
    owner: "Proprietário",
    admin: "Administrador",
    manager: "Gerente",
    supervisor: "Supervisor",
    receptionist: "Recepcionista",
    employee: "Funcionário",
    employer: "Proprietário",
    rh: "RH",
    marketing: "Marketing",
    designer: "Designer",
  };
  return role ? labels[role] || role : "Sem função definida";
}

export default function HumanResources() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState("employee");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [slug]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: companyData, error: companyError }, { data: authData }] = await Promise.all([
        supabase.from("companies").select("id, name, slug, owner_id").eq("slug", slug).single(),
        supabase.auth.getUser(),
      ]);

      if (companyError) throw companyError;
      if (!companyData || !authData.user) return;

      setCompany(companyData);
      setCurrentUser(authData.user);

      const { data: employee } = await supabase
        .from("employees")
        .select("id, role")
        .eq("company_id", companyData.id)
        .eq("user_id", authData.user.id)
        .maybeSingle();

      // IMPORTANT: company ownership has priority over employees.role.
      // The owner may also have an employees row with role="employer" (or another role)
      // because the owner can also be a professional. That must never downgrade admin access.
      const resolvedRole = companyData.owner_id === authData.user.id
        ? "owner"
        : employee?.role || "employee";

      setUserRole(resolvedRole);

      const { data: employeesData, error: employeesError } = await supabase
        .from("employees")
        .select("id, name, role, is_active, created_at")
        .eq("company_id", companyData.id)
        .order("name");

      if (employeesError) throw employeesError;
      setEmployees(employeesData || []);
    } catch (error) {
      console.error("Error loading HR data:", error);
    } finally {
      setLoading(false);
    }
  };

  const { hasPermission, loading: permissionLoading, userRole: permissionRole } = usePermissions(company?.id, currentUser);
  const isAdministrator = userRole === "owner" || userRole === "admin" || permissionRole === "owner" || permissionRole === "admin";
  const canView = isAdministrator || hasPermission("hr.view");

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.is_active !== false), [employees]);
  const inactiveEmployees = employees.length - activeEmployees.length;
  const recentEmployees = useMemo(
    () => [...employees].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
    [employees]
  );

  if (loading || permissionLoading) {
    return (
      <BusinessLayout companySlug={slug || ""} companyName="Carregando..." companyId="" userRole="loading">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </BusinessLayout>
    );
  }

  if (!company || !currentUser || !canView) {
    return (
      <BusinessLayout
        companySlug={slug || ""}
        companyName={company?.name || "Acesso Negado"}
        companyId={company?.id || ""}
        userRole={isAdministrator ? "owner" : userRole}
        currentUser={currentUser}
      >
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Acesso Negado</CardTitle>
              <CardDescription>Você não possui a permissão para visualizar Recursos Humanos.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </BusinessLayout>
    );
  }

  const layoutRole = isAdministrator ? "owner" : userRole;

  return (
    <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={layoutRole} currentUser={currentUser}>
      <div className="p-4 sm:p-6 sm:px-10 w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Recursos Humanos</h1>
          <p className="text-muted-foreground mt-1">Gestão administrativa e acompanhamento da equipe da empresa.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-5 flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Colaboradores</p><p className="text-2xl font-bold mt-1">{employees.length}</p></div><Users className="w-8 h-8 text-primary" /></CardContent></Card>
          <Card><CardContent className="p-5 flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Ativos</p><p className="text-2xl font-bold mt-1">{activeEmployees.length}</p></div><CheckCircle2 className="w-8 h-8 text-primary" /></CardContent></Card>
          <Card><CardContent className="p-5 flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Inativos</p><p className="text-2xl font-bold mt-1">{inactiveEmployees}</p></div><Archive className="w-8 h-8 text-muted-foreground" /></CardContent></Card>
          <Card><CardContent className="p-5 flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Acompanhamento</p><p className="text-sm font-semibold mt-2">Estrutura inicial</p></div><Activity className="w-8 h-8 text-primary" /></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Módulos de RH</CardTitle><CardDescription>O RH fica separado da gestão operacional de Colaboradores. Cada módulo terá sua própria permissão.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {hrModules.filter((module) => isAdministrator || hasPermission(module.permission) || hasPermission("hr.view")).map((module) => {
                const Icon = module.icon;
                return <Card key={module.title} className="bg-card/60"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="w-5 h-5" /></div><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold">{module.title}</h3><Badge variant="outline">Módulo</Badge></div><p className="text-sm text-muted-foreground mt-1">{module.description}</p></div></div></CardContent></Card>;
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Equipe</CardTitle><CardDescription>Visão rápida dos colaboradores cadastrados na empresa.</CardDescription></CardHeader>
          <CardContent>
            {recentEmployees.length === 0 ? <div className="py-10 text-center text-muted-foreground">Nenhum colaborador cadastrado.</div> : <div className="space-y-3">{recentEmployees.map((employee, index) => <div key={employee.id}><div className="flex items-center justify-between gap-4 py-2"><div className="min-w-0"><p className="font-medium truncate">{employee.name}</p><p className="text-sm text-muted-foreground">{roleLabel(employee.role)}</p></div><Badge variant={employee.is_active === false ? "secondary" : "outline"}>{employee.is_active === false ? "Inativo" : "Ativo"}</Badge></div>{index < recentEmployees.length - 1 && <Separator />}</div>)}</div>}
          </CardContent>
        </Card>
      </div>
    </BusinessLayout>
  );
}
