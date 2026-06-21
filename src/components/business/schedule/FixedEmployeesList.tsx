import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, Briefcase, ShieldCheck, Users } from "lucide-react";

interface FixedEmployeesListProps {
  companyId: string;
}

interface FixedEmployee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_active: boolean;
  base_occupation?: { name: string } | null;
  system_profile?: { name: string; code: string } | null;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Dono",
  manager: "Gerente",
  supervisor: "Encarregado",
  receptionist: "Recepcionista",
  employee: "Colaborador",
};

export function FixedEmployeesList({ companyId }: FixedEmployeesListProps) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<FixedEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id, name, email, phone, role, is_active, base_occupation:base_occupations(name), system_profile:system_profiles(name, code)"
        )
        .eq("company_id", companyId)
        .eq("employee_type", "fixo")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setEmployees((data as unknown as FixedEmployee[]) || []);
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os colaboradores fixos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Colaboradores Fixos
        </CardTitle>
        <CardDescription>
          Lista dos colaboradores fixos da empresa. A jornada de trabalho agora é definida
          através das <strong>Escalas</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : employees.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhum colaborador fixo cadastrado.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="rounded-lg border border-primary/20 bg-background/40 p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="h-10 w-10 border border-primary/30">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(emp.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{emp.name}</p>
                    {emp.role && (
                      <Badge variant="outline" className="mt-0.5 text-xs">
                        {ROLE_LABEL[emp.role] ?? emp.role}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-muted-foreground">
                  {emp.email && (
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                  )}
                  {emp.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{emp.phone}</span>
                    </div>
                  )}
                  {emp.base_occupation?.name && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 shrink-0" />
                      <span>{emp.base_occupation.name}</span>
                    </div>
                  )}
                  {emp.system_profile?.name && (
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>{emp.system_profile.name}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
