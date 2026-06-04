import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, ArrowLeft, CalendarIcon, Clock, User, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface Combo {
  id: string;
  name: string;
  price: number;
  service_combo_items: { service_id: string; services: { duration_minutes: number } }[];
}

interface Employee {
  id: string;
  name: string;
}

interface TimeSlot {
  time: string;
  employee_id: string;
  employee_name: string;
}

interface AddBookingDialogProps {
  companyId: string;
  companySlug: string;
  onBookingAdded: () => void;
}

type Step = 'service' | 'employee' | 'date' | 'time' | 'client';

export function AddBookingDialog({ companyId, companySlug, onBookingAdded }: AddBookingDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('service');
  const { toast } = useToast();

  // Data states
  const [services, setServices] = useState<Service[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Selection states
  const [selectedType, setSelectedType] = useState<'service' | 'combo'>('service');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedComboId, setSelectedComboId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Client form
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });
  const [existingClient, setExistingClient] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      resetForm();
      fetchServicesAndCombos();
    }
  }, [open]);

  const resetForm = () => {
    setStep('service');
    setSelectedType('service');
    setSelectedServiceId('');
    setSelectedComboId('');
    setSelectedEmployeeId('');
    setSelectedDate(undefined);
    setSelectedTime('');
    setClientForm({ name: '', email: '', phone: '', password: '' });
    setExistingClient(null);
    setEmployees([]);
    setAvailableDates([]);
    setTimeSlots([]);
  };

  const fetchServicesAndCombos = async () => {
    setLoadingData(true);
    try {
      const [servicesRes, combosRes] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, price, duration_minutes')
          .eq('company_id', companyId)
          .eq('is_active', true),
        supabase
          .from('service_combos')
          .select(`
            id, name, price,
            service_combo_items(service_id, services(duration_minutes))
          `)
          .eq('company_id', companyId)
          .eq('is_active', true)
      ]);

      setServices(servicesRes.data || []);
      setCombos(combosRes.data || []);
    } catch (error) {
      console.error('Error fetching services/combos:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchEmployeesForService = async (serviceId: string, isCombo: boolean) => {
    setLoadingData(true);
    try {
      let serviceIds: string[] = [];

      if (isCombo) {
        // Get all service IDs from combo
        const combo = combos.find(c => c.id === serviceId);
        if (combo) {
          serviceIds = combo.service_combo_items.map(item => item.service_id);
        }
      } else {
        serviceIds = [serviceId];
      }

      // Get employees that have ALL services (for combos) or the specific service
      const { data: employeeServices } = await supabase
        .from('employee_services')
        .select('employee_id, service_id')
        .in('service_id', serviceIds);

      if (!employeeServices || employeeServices.length === 0) {
        setEmployees([]);
        return;
      }

      // For combos, filter employees that have ALL services
      const employeeServiceCount: Record<string, number> = {};
      employeeServices.forEach(es => {
        employeeServiceCount[es.employee_id] = (employeeServiceCount[es.employee_id] || 0) + 1;
      });

      const eligibleEmployeeIds = Object.entries(employeeServiceCount)
        .filter(([_, count]) => count >= serviceIds.length)
        .map(([id]) => id);

      if (eligibleEmployeeIds.length === 0) {
        setEmployees([]);
        return;
      }

      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, name')
        .in('id', eligibleEmployeeIds)
        .eq('is_active', true);

      setEmployees(employeesData || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchAvailableDates = async () => {
    setLoadingData(true);
    const dates: Date[] = [];
    const today = startOfDay(new Date());
    const serviceId = selectedType === 'service' ? selectedServiceId : 
      combos.find(c => c.id === selectedComboId)?.service_combo_items[0]?.service_id || '';

    try {
      // Check next 30 days
      for (let i = 0; i < 30; i++) {
        const checkDate = addDays(today, i);
        const dateStr = format(checkDate, 'yyyy-MM-dd');

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-availability?company_id=${companyId}&service_id=${serviceId}&employee_id=${selectedEmployeeId}&date=${dateStr}`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.slots && data.slots.length > 0) {
            dates.push(checkDate);
          }
        }
      }

      setAvailableDates(dates);
    } catch (error) {
      console.error('Error fetching available dates:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchTimeSlots = async (date: Date) => {
    setLoadingData(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const serviceId = selectedType === 'service' ? selectedServiceId : 
        combos.find(c => c.id === selectedComboId)?.service_combo_items[0]?.service_id || '';

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-availability?company_id=${companyId}&service_id=${serviceId}&employee_id=${selectedEmployeeId}&date=${dateStr}`
      );

      if (response.ok) {
        const data = await response.json();
        setTimeSlots(data.slots || []);
      }
    } catch (error) {
      console.error('Error fetching time slots:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const checkClientEmail = async (email: string) => {
    if (!email || !email.includes('@')) return;
    
    setCheckingEmail(true);
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone')
        .eq('company_id', companyId)
        .eq('email', email)
        .maybeSingle();

      if (data) {
        setExistingClient(true);
        setClientForm(prev => ({ 
          ...prev, 
          name: data.name || prev.name,
          phone: data.phone || prev.phone
        }));
      } else {
        setExistingClient(false);
      }
    } catch (error) {
      console.error('Error checking client:', error);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleServiceSelect = (id: string, type: 'service' | 'combo') => {
    setSelectedType(type);
    if (type === 'service') {
      setSelectedServiceId(id);
      setSelectedComboId('');
    } else {
      setSelectedComboId(id);
      setSelectedServiceId('');
    }
  };

  const handleNextStep = async () => {
    switch (step) {
      case 'service':
        if (selectedServiceId || selectedComboId) {
          await fetchEmployeesForService(
            selectedType === 'service' ? selectedServiceId : selectedComboId,
            selectedType === 'combo'
          );
          setStep('employee');
        }
        break;
      case 'employee':
        if (selectedEmployeeId) {
          await fetchAvailableDates();
          setStep('date');
        }
        break;
      case 'date':
        if (selectedDate) {
          await fetchTimeSlots(selectedDate);
          setStep('time');
        }
        break;
      case 'time':
        if (selectedTime) {
          setStep('client');
        }
        break;
    }
  };

  const handlePrevStep = () => {
    switch (step) {
      case 'employee':
        setSelectedEmployeeId('');
        setStep('service');
        break;
      case 'date':
        setSelectedDate(undefined);
        setStep('employee');
        break;
      case 'time':
        setSelectedTime('');
        setStep('date');
        break;
      case 'client':
        setClientForm({ name: '', email: '', phone: '', password: '' });
        setExistingClient(null);
        setStep('time');
        break;
    }
  };

  const handleDateSelect = async (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setSelectedTime('');
    await fetchTimeSlots(date);
    setStep('time');
  };

  const getSelectedServiceDetails = () => {
    if (selectedType === 'service') {
      const service = services.find(s => s.id === selectedServiceId);
      return service ? {
        name: service.name,
        price: service.price,
        duration: service.duration_minutes
      } : null;
    } else {
      const combo = combos.find(c => c.id === selectedComboId);
      if (!combo) return null;
      const totalDuration = combo.service_combo_items.reduce(
        (sum, item) => sum + (item.services?.duration_minutes || 0), 0
      );
      return {
        name: combo.name,
        price: combo.price,
        duration: totalDuration
      };
    }
  };

  const handleSubmit = async () => {
    if (!clientForm.name || !clientForm.email || !clientForm.phone) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome, email e telefone.",
        variant: "destructive",
      });
      return;
    }

    if (!existingClient && !clientForm.password) {
      toast({
        title: "Senha obrigatória",
        description: "Para novos clientes, informe uma senha padrão.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const serviceDetails = getSelectedServiceDetails();
      if (!serviceDetails) throw new Error('Serviço não encontrado');

      // Call the edge function to create booking
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-booking`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({
            company_id: companyId,
            company_slug: companySlug,
            service_id: selectedType === 'service' ? selectedServiceId : null,
            combo_id: selectedType === 'combo' ? selectedComboId : null,
            combo_items: selectedType === 'combo' 
              ? combos.find(c => c.id === selectedComboId)?.service_combo_items.map(i => i.service_id)
              : null,
            employee_id: selectedEmployeeId,
            booking_date: format(selectedDate!, 'yyyy-MM-dd'),
            booking_time: selectedTime,
            duration_minutes: serviceDetails.duration,
            price: serviceDetails.price,
            client_name: clientForm.name,
            client_email: clientForm.email,
            client_phone: clientForm.phone,
            client_password: clientForm.password,
            is_new_client: !existingClient
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar agendamento');
      }

      toast({
        title: "Agendamento criado!",
        description: existingClient 
          ? "O agendamento foi realizado com sucesso."
          : "O agendamento foi criado e o cliente receberá um email com os dados de acesso.",
      });

      setOpen(false);
      onBookingAdded();
    } catch (error: any) {
      console.error('Error creating booking:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar o agendamento.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isDateAvailable = (date: Date) => {
    return availableDates.some(d => 
      d.getFullYear() === date.getFullYear() &&
      d.getMonth() === date.getMonth() &&
      d.getDate() === date.getDate()
    );
  };

  const getStepTitle = () => {
    switch (step) {
      case 'service': return 'Selecione o Serviço';
      case 'employee': return 'Selecione o Profissional';
      case 'date': return 'Selecione a Data';
      case 'time': return 'Selecione o Horário';
      case 'client': return 'Dados do Cliente';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[420px] sm:max-w-[500px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step !== 'service' && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handlePrevStep}
                className="h-8 w-8"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div>
              <DialogTitle>{getStepTitle()}</DialogTitle>
              <DialogDescription>
                Passo {['service', 'employee', 'date', 'time', 'client'].indexOf(step) + 1} de 5
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {/* Step 1: Service Selection */}
          {step === 'service' && (
            <div className="space-y-4">
              {loadingData ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {services.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-sm">Serviços</Label>
                      {services.map(service => (
                        <div
                          key={service.id}
                          className={cn(
                            "p-3 border rounded-lg cursor-pointer transition-all",
                            selectedServiceId === service.id
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => handleServiceSelect(service.id, 'service')}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{service.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {service.duration_minutes} min
                              </p>
                            </div>
                            <p className="font-semibold text-primary">
                              R$ {service.price.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {combos.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-sm">Combos</Label>
                      {combos.map(combo => {
                        const totalDuration = combo.service_combo_items.reduce(
                          (sum, item) => sum + (item.services?.duration_minutes || 0), 0
                        );
                        return (
                          <div
                            key={combo.id}
                            className={cn(
                              "p-3 border rounded-lg cursor-pointer transition-all",
                              selectedComboId === combo.id
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            )}
                            onClick={() => handleServiceSelect(combo.id, 'combo')}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">{combo.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {totalDuration} min
                                </p>
                              </div>
                              <p className="font-semibold text-primary">
                                R$ {combo.price.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <Button 
                    className="w-full mt-4" 
                    onClick={handleNextStep}
                    disabled={!selectedServiceId && !selectedComboId}
                  >
                    Continuar
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 2: Employee Selection */}
          {step === 'employee' && (
            <div className="space-y-4">
              {loadingData ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : employees.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">
                    Nenhum profissional disponível para este serviço
                  </p>
                </div>
              ) : (
                <>
                  {employees.map(employee => (
                    <div
                      key={employee.id}
                      className={cn(
                        "p-3 border rounded-lg cursor-pointer transition-all flex items-center gap-3",
                        selectedEmployeeId === employee.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setSelectedEmployeeId(employee.id)}
                    >
                      <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/50 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <p className="font-medium">{employee.name}</p>
                      {selectedEmployeeId === employee.id && (
                        <Check className="w-5 h-5 text-primary ml-auto" />
                      )}
                    </div>
                  ))}

                  <Button 
                    className="w-full mt-4" 
                    onClick={handleNextStep}
                    disabled={!selectedEmployeeId}
                  >
                    Continuar
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Date Selection */}
          {step === 'date' && (
            <div className="space-y-4">
              {loadingData ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : availableDates.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">
                    Nenhuma data disponível nos próximos 30 dias
                  </p>
                </div>
              ) : (
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  locale={ptBR}
                  disabled={(date) => 
                    isBefore(date, startOfDay(new Date())) || !isDateAvailable(date)
                  }
                  className="rounded-md border mx-auto"
                />
              )}
            </div>
          )}

          {/* Step 4: Time Selection */}
          {step === 'time' && (
            <div className="space-y-4">
              {selectedDate && (
                <p className="text-center font-medium">
                  {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </p>
              )}

              {loadingData ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : timeSlots.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">
                    Nenhum horário disponível nesta data
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {timeSlots.map(slot => (
                      <Button
                        key={slot.time}
                        variant={selectedTime === slot.time ? "default" : "outline"}
                        className="text-sm"
                        onClick={() => setSelectedTime(slot.time)}
                      >
                        {slot.time}
                      </Button>
                    ))}
                  </div>

                  <Button 
                    className="w-full mt-4" 
                    onClick={handleNextStep}
                    disabled={!selectedTime}
                  >
                    Continuar
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 5: Client Form */}
          {step === 'client' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Serviço:</span>{' '}
                  <span className="font-medium">{getSelectedServiceDetails()?.name}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Profissional:</span>{' '}
                  <span className="font-medium">
                    {employees.find(e => e.id === selectedEmployeeId)?.name}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Data:</span>{' '}
                  <span className="font-medium">
                    {selectedDate && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Horário:</span>{' '}
                  <span className="font-medium">{selectedTime}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Valor:</span>{' '}
                  <span className="font-medium text-primary">
                    R$ {getSelectedServiceDetails()?.price.toFixed(2)}
                  </span>
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email do Cliente *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={clientForm.email}
                    onChange={(e) => {
                      setClientForm(prev => ({ ...prev, email: e.target.value }));
                      setExistingClient(null);
                    }}
                    onBlur={(e) => checkClientEmail(e.target.value)}
                    placeholder="cliente@email.com"
                  />
                  {checkingEmail && (
                    <p className="text-xs text-muted-foreground">Verificando...</p>
                  )}
                  {existingClient === true && (
                    <p className="text-xs text-green-600">✓ Cliente já cadastrado</p>
                  )}
                  {existingClient === false && (
                    <p className="text-xs text-amber-600">Novo cliente - será criada uma conta</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    value={clientForm.name}
                    onChange={(e) => setClientForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Nome do cliente"
                    disabled={existingClient === true}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">WhatsApp *</Label>
                  <Input
                    id="phone"
                    value={clientForm.phone}
                    onChange={(e) => setClientForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    disabled={existingClient === true}
                  />
                </div>

                {existingClient === false && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha Padrão *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={clientForm.password}
                      onChange={(e) => setClientForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Senha para o cliente"
                      minLength={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      O cliente receberá um email com estes dados de acesso
                    </p>
                  </div>
                )}

                <Button 
                  className="w-full mt-4" 
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Confirmar Agendamento'
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
