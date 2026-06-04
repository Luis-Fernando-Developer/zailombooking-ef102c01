import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Calendar, Building, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BlockedSlotsManagerProps {
  companyId: string;
}

interface Employee {
  id: string;
  name: string;
}

// Aligned with database schema - blocked_slots table uses start_datetime/end_datetime
interface BlockedSlot {
  id: string;
  employee_id: string | null;
  employee_name?: string;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
}

export function BlockedSlotsManager({ companyId }: BlockedSlotsManagerProps) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSlot, setNewSlot] = useState({
    is_company_wide: true,
    employee_id: "",
    blocked_date: format(new Date(), 'yyyy-MM-dd'),
    all_day: true,
    start_time: "09:00",
    end_time: "18:00",
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

      // Fetch blocked slots
      const today = new Date().toISOString();
      const { data: slotsData, error } = await supabase
        .from('blocked_slots')
        .select('id, employee_id, start_datetime, end_datetime, reason')
        .eq('company_id', companyId)
        .gte('start_datetime', today)
        .order('start_datetime');

      if (error) throw error;

      // Join with employee names
      const slotsWithNames = (slotsData || []).map(slot => {
        const employee = employeesData?.find(e => e.id === slot.employee_id);
        return {
          ...slot,
          employee_name: employee?.name
        };
      });

      setBlockedSlots(slotsWithNames);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSlot = async () => {
    if (!newSlot.is_company_wide && !newSlot.employee_id) {
      toast({
        title: "Erro",
        description: "Selecione um colaborador ou marque como bloqueio geral.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Build datetime strings
      const startDatetime = newSlot.all_day 
        ? `${newSlot.blocked_date}T00:00:00` 
        : `${newSlot.blocked_date}T${newSlot.start_time}:00`;
      const endDatetime = newSlot.all_day 
        ? `${newSlot.blocked_date}T23:59:59` 
        : `${newSlot.blocked_date}T${newSlot.end_time}:00`;

      const { error } = await supabase
        .from('blocked_slots')
        .insert({
          company_id: companyId,
          employee_id: newSlot.is_company_wide ? null : newSlot.employee_id,
          start_datetime: startDatetime,
          end_datetime: endDatetime,
          reason: newSlot.reason || null,
        });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Bloqueio registrado!"
      });

      setDialogOpen(false);
      setNewSlot({
        is_company_wide: true,
        employee_id: "",
        blocked_date: format(new Date(), 'yyyy-MM-dd'),
        all_day: true,
        start_time: "09:00",
        end_time: "18:00",
        reason: "",
      });
      fetchData();
    } catch (error) {
      console.error('Error adding blocked slot:', error);
      toast({
        title: "Erro",
        description: "Não foi possível registrar o bloqueio.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteSlot = async (id: string) => {
    try {
      const { error } = await supabase
        .from('blocked_slots')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Bloqueio removido!"
      });

      fetchData();
    } catch (error) {
      console.error('Error deleting blocked slot:', error);
      toast({
        title: "Erro",
        description: "Não foi possível remover o bloqueio.",
        variant: "destructive"
      });
    }
  };

  const isCompanyWide = (slot: BlockedSlot) => !slot.employee_id;

  const formatSlotDateTime = (slot: BlockedSlot) => {
    const start = parseISO(slot.start_datetime);
    const end = parseISO(slot.end_datetime);
    const dateStr = format(start, "EEEE, dd 'de' MMMM", { locale: ptBR });
    const startTime = format(start, 'HH:mm');
    const endTime = format(end, 'HH:mm');
    
    // Check if it's all day (starts at 00:00 and ends at 23:59)
    if (startTime === '00:00' && endTime === '23:59') {
      return { date: dateStr, time: 'Dia inteiro' };
    }
    return { date: dateStr, time: `${startTime} - ${endTime}` };
  };

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
        <CardTitle>Bloqueios de Horário</CardTitle>
        <CardDescription>
          Bloqueie datas ou horários específicos (feriados, eventos, manutenção, etc).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Bloqueio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Bloqueio</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Switch
                  checked={newSlot.is_company_wide}
                  onCheckedChange={(checked) => setNewSlot(prev => ({ 
                    ...prev, 
                    is_company_wide: checked,
                    employee_id: checked ? "" : prev.employee_id
                  }))}
                />
                <div>
                  <Label>Bloqueio Geral (toda a empresa)</Label>
                  <p className="text-xs text-muted-foreground">
                    Afeta todos os colaboradores (ex: feriado)
                  </p>
                </div>
              </div>

              {!newSlot.is_company_wide && (
                <div>
                  <Label>Colaborador</Label>
                  <Select 
                    value={newSlot.employee_id} 
                    onValueChange={(v) => setNewSlot(prev => ({ ...prev, employee_id: v }))}
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
              )}

              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={newSlot.blocked_date}
                  onChange={(e) => setNewSlot(prev => ({ ...prev, blocked_date: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={newSlot.all_day}
                  onCheckedChange={(checked) => setNewSlot(prev => ({ ...prev, all_day: checked }))}
                />
                <Label>Dia inteiro</Label>
              </div>

              {!newSlot.all_day && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Início</Label>
                    <Input
                      type="time"
                      value={newSlot.start_time}
                      onChange={(e) => setNewSlot(prev => ({ ...prev, start_time: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Fim</Label>
                    <Input
                      type="time"
                      value={newSlot.end_time}
                      onChange={(e) => setNewSlot(prev => ({ ...prev, end_time: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div>
                <Label>Motivo (opcional)</Label>
                <Input
                  value={newSlot.reason}
                  onChange={(e) => setNewSlot(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Ex: Feriado, Manutenção..."
                />
              </div>

              <Button onClick={handleAddSlot} className="w-full">
                Adicionar Bloqueio
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* List of blocked slots */}
        <div className="space-y-2">
          {blockedSlots.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhum bloqueio registrado.
            </p>
          ) : (
            blockedSlots.map(slot => {
              const { date, time } = formatSlotDateTime(slot);
              return (
                <div 
                  key={slot.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {isCompanyWide(slot) ? (
                        <Badge className="bg-destructive text-white">
                          <Building className="w-3 h-3 mr-1" />
                          Toda Empresa
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <User className="w-3 h-3 mr-1" />
                          {slot.employee_name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {date}
                      <span>({time})</span>
                    </div>
                    {slot.reason && (
                      <p className="text-sm text-muted-foreground">{slot.reason}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteSlot(slot.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
