import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Users, Lock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AutonomousAvailabilityConfigProps {
  companyId: string;
  /** Quando definido, restringe a aba ao próprio colaborador (caso de role=employee + autonomo) */
  restrictToEmployeeId?: string;
  /** Modo somente leitura — esconde botões de adicionar/excluir */
  readOnly?: boolean;
}

interface Employee {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  base_occupation?: { name: string } | null;
}

interface Availability {
  id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
}

export function AutonomousAvailabilityConfig({ companyId, restrictToEmployeeId, readOnly = false }: AutonomousAvailabilityConfigProps) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAvailability, setNewAvailability] = useState({
    date: new Date(),
    start_time: "09:00",
    end_time: "18:00",
    break_start: "",
    break_end: "",
  });

  useEffect(() => {
    fetchEmployees();
  }, [companyId, restrictToEmployeeId]);

  useEffect(() => {
    if (selectedEmployee) {
      fetchAvailabilities();
    }
  }, [selectedEmployee]);

  const fetchEmployees = async () => {
    try {
      let query = supabase
        .from('employees')
        .select('id, name, email, phone, avatar_url, base_occupation:base_occupations(name)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('employee_type', 'autonomo')
        .order('name');

      if (restrictToEmployeeId) {
        query = query.eq('id', restrictToEmployeeId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEmployees(((data || []) as unknown) as Employee[]);

      if (data && data.length > 0) {
        setSelectedEmployee(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailabilities = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('employee_availability')
        .select('id, available_date, start_time, end_time, break_start, break_end')
        .eq('employee_id', selectedEmployee)
        .gte('available_date', today)
        .order('available_date');

      if (error) throw error;
      setAvailabilities(data || []);
    } catch (error) {
      console.error('Error fetching availabilities:', error);
    }
  };

  const handleAddAvailability = async () => {
    try {
      const dateStr = format(newAvailability.date, 'yyyy-MM-dd');
      // Delete-then-insert (sem unique constraint confiável)
      const { error: delError } = await supabase
        .from('employee_availability')
        .delete()
        .eq('employee_id', selectedEmployee)
        .eq('available_date', dateStr);
      if (delError) throw delError;

      const { error } = await supabase
        .from('employee_availability')
        .insert({
          company_id: companyId,
          employee_id: selectedEmployee,
          available_date: dateStr,
          start_time: newAvailability.start_time,
          end_time: newAvailability.end_time,
          break_start: newAvailability.break_start || null,
          break_end: newAvailability.break_end || null,
        });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Disponibilidade adicionada!"
      });

      setDialogOpen(false);
      fetchAvailabilities();
    } catch (error) {
      console.error('Error adding availability:', error);
      toast({
        title: "Erro",
        description: "Não foi possível adicionar a disponibilidade.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteAvailability = async (id: string) => {
    try {
      const { error } = await supabase
        .from('employee_availability')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Disponibilidade removida!"
      });

      fetchAvailabilities();
    } catch (error) {
      console.error('Error deleting availability:', error);
      toast({
        title: "Erro",
        description: "Não foi possível remover a disponibilidade.",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <Card className="card-glow">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            Nenhum colaborador cadastrado. Adicione colaboradores para configurar disponibilidade.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-6">
      {readOnly && !restrictToEmployeeId && (
        <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Colaboradores Autônomos
            </CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Apenas o próprio autônomo pode editar sua disponibilidade. Esta visualização é somente leitura.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  onClick={() => setSelectedEmployee(emp.id)}
                  className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                    selectedEmployee === emp.id
                      ? "border-primary bg-primary/10"
                      : "border-primary/20 bg-background/40 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-primary/30">
                      <AvatarImage src={emp.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(emp.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{emp.name}</p>
                      <Badge variant="outline" className="mt-0.5 text-xs">
                        Autônomo
                      </Badge>
                    </div>
                  </div>
                  {emp.base_occupation?.name && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      {emp.base_occupation.name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    <Card className="card-glow">
      <CardHeader>
        <CardTitle>Disponibilidade por Data</CardTitle>
        <CardDescription>
          Colaboradores podem definir sua disponibilidade por data específica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Label>Selecione o Colaborador</Label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
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

          {!readOnly && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Disponibilidade
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova Disponibilidade</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Data</Label>
                  <Calendar
                    mode="single"
                    selected={newAvailability.date}
                    onSelect={(date) => date && setNewAvailability(prev => ({ ...prev, date }))}
                    locale={ptBR}
                    className="rounded-md border"
                    disabled={(date) => date < new Date()}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Início</Label>
                    <Input
                      type="time"
                      value={newAvailability.start_time}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, start_time: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Fim</Label>
                    <Input
                      type="time"
                      value={newAvailability.end_time}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, end_time: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Intervalo - Início</Label>
                    <Input
                      type="time"
                      value={newAvailability.break_start}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, break_start: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                  <div>
                    <Label>Intervalo - Fim</Label>
                    <Input
                      type="time"
                      value={newAvailability.break_end}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, break_end: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                </div>

                <Button onClick={handleAddAvailability} className="w-full">
                  Salvar Disponibilidade
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>

        {/* List of availabilities */}
        <div className="space-y-2">
          {availabilities.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma disponibilidade cadastrada para este colaborador.
            </p>
          ) : (
            availabilities.map(avail => (
              <div 
                key={avail.id}
                className="flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-card/50"
              >
                <div>
                  <p className="font-medium">
                    {format(new Date(avail.available_date + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {avail.start_time} - {avail.end_time}
                    {avail.break_start && avail.break_end && (
                      <span> (Intervalo: {avail.break_start} - {avail.break_end})</span>
                    )}
                  </p>
                </div>
                {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteAvailability(avail.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
