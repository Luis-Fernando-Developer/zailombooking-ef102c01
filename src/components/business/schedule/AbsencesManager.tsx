import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Calendar } from "lucide-react";
import { format, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AbsencesManagerProps {
  companyId: string;
}

interface Employee {
  id: string;
  name: string;
}

interface Absence {
  id: string;
  employee_id: string | null;
  employee_name?: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

const ABSENCE_TYPES = [
  { value: 'vacation', label: 'Férias', color: 'bg-blue-500' },
  { value: 'day_off', label: 'Folga', color: 'bg-green-500' },
  { value: 'sick_leave', label: 'Atestado Médico', color: 'bg-yellow-500' },
  { value: 'suspension', label: 'Suspensão', color: 'bg-red-500' },
  { value: 'other', label: 'Outro', color: 'bg-gray-500' },
];

export function AbsencesManager({ companyId }: AbsencesManagerProps) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [newAbsence, setNewAbsence] = useState({
    employee_id: "",
    absence_type: "vacation",
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    reason: "",
  });

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const fetchData = async () => {
    try {
      // Fetch employees
      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');

      setEmployees(employeesData || []);

      // Fetch absences - using employee_absences table
      const { data: absencesData, error } = await supabase
        .from('employee_absences')
        .select('id, employee_id, absence_type, start_date, end_date, reason')
        .eq('company_id', companyId)
        .order('start_date', { ascending: false });

      if (error) throw error;

      // Join with employee names
      const absencesWithNames = (absencesData || []).map(abs => {
        const employee = employeesData?.find(e => e.id === abs.employee_id);
        return {
          ...abs,
          employee_name: employee?.name || 'Desconhecido'
        };
      });

      setAbsences(absencesWithNames);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAbsence = async () => {
    if (!newAbsence.employee_id) {
      toast({
        title: "Erro",
        description: "Selecione um colaborador.",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('employee_absences')
        .insert({
          company_id: companyId,
          employee_id: newAbsence.employee_id,
          absence_type: newAbsence.absence_type,
          start_date: newAbsence.start_date,
          end_date: newAbsence.end_date,
          reason: newAbsence.reason || null,
        });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Ausência registrada!"
      });

      setDialogOpen(false);
      setNewAbsence({
        employee_id: "",
        absence_type: "vacation",
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(new Date(), 'yyyy-MM-dd'),
        reason: "",
      });
      fetchData();
    } catch (error) {
      console.error('Error adding absence:', error);
      toast({
        title: "Erro",
        description: "Não foi possível registrar a ausência.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteAbsence = async (id: string) => {
    try {
      const { error } = await supabase
        .from('employee_absences')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Ausência removida!"
      });

      fetchData();
    } catch (error) {
      console.error('Error deleting absence:', error);
      toast({
        title: "Erro",
        description: "Não foi possível remover a ausência.",
        variant: "destructive"
      });
    }
  };

  const getAbsenceTypeBadge = (type: string) => {
    const absenceType = ABSENCE_TYPES.find(t => t.value === type);
    return absenceType ? (
      <Badge className={`${absenceType.color} text-white`}>
        {absenceType.label}
      </Badge>
    ) : null;
  };

  const isCurrentlyActive = (startDate: string, endDate: string) => {
    const today = new Date();
    return isWithinInterval(today, {
      start: parseISO(startDate),
      end: parseISO(endDate)
    });
  };

  const filteredAbsences = filterEmployee === "all" 
    ? absences 
    : absences.filter(a => a.employee_id === filterEmployee);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle>Gestão de Ausências</CardTitle>
        <CardDescription>
          Registre férias, folgas, atestados e afastamentos dos colaboradores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Label>Filtrar por Colaborador</Label>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os colaboradores</SelectItem>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Registrar Ausência
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Ausência</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Colaborador</Label>
                  <Select 
                    value={newAbsence.employee_id} 
                    onValueChange={(v) => setNewAbsence(prev => ({ ...prev, employee_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Tipo de Ausência</Label>
                  <Select 
                    value={newAbsence.absence_type} 
                    onValueChange={(v) => setNewAbsence(prev => ({ ...prev, absence_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ABSENCE_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data Início</Label>
                    <Input
                      type="date"
                      value={newAbsence.start_date}
                      onChange={(e) => setNewAbsence(prev => ({ ...prev, start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Data Fim</Label>
                    <Input
                      type="date"
                      value={newAbsence.end_date}
                      onChange={(e) => setNewAbsence(prev => ({ ...prev, end_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label>Motivo (opcional)</Label>
                  <Textarea
                    value={newAbsence.reason}
                    onChange={(e) => setNewAbsence(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="Descreva o motivo..."
                  />
                </div>

                <Button onClick={handleAddAbsence} className="w-full">
                  Registrar Ausência
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* List of absences */}
        <div className="space-y-2">
          {filteredAbsences.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma ausência registrada.
            </p>
          ) : (
            filteredAbsences.map(absence => (
              <div 
                key={absence.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  isCurrentlyActive(absence.start_date, absence.end_date)
                    ? 'border-yellow-500/50 bg-yellow-500/10'
                    : 'border-primary/20 bg-card/50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{absence.employee_name}</span>
                    {getAbsenceTypeBadge(absence.absence_type)}
                    {isCurrentlyActive(absence.start_date, absence.end_date) && (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    {format(parseISO(absence.start_date), "dd/MM/yyyy", { locale: ptBR })} 
                    {' - '}
                    {format(parseISO(absence.end_date), "dd/MM/yyyy", { locale: ptBR })}
                  </div>
                  {absence.reason && (
                    <p className="text-sm text-muted-foreground">{absence.reason}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteAbsence(absence.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
