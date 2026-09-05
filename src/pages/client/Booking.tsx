import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookingLogo } from "@/components/BookingLogo";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  Clock,
  DollarSign,
  User,
  Mail,
  Phone,
  ArrowLeft,
  Check,
  CreditCard,
  QrCode,
  Receipt,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";
import { BookingPaymentDialog } from "@/components/booking/BookingPaymentDialog";
import { getAvailability, AVAILABILITY_REASON_LABELS } from "@/lib/api/availability";
import { applyTheme, getInitialTheme } from "@/components/ThemeToggle";
import { getTypographyStyles, getBackgroundStyles, getCardStyles, getButtonStyles } from "@/components/business/personalization/utils";


interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  image_url?: string;
  payment_required?: string;
}

interface Employee {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
}

interface BookingForm {
  client_name: string;
  client_email: string;
  client_phone: string;
  notes: string;
}

export default function ClientBooking() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [availabilityReason, setAvailabilityReason] = useState<string | null>(null);

  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [formData, setFormData] = useState<BookingForm>({
    client_name: "",
    client_email: "",
    client_phone: "",
    notes: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1); // 1: Service, 2: Employee, 3: Date, 4: Time, 5: Auth, 6: Confirmation, 7: Payment
  const [user, setUser] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [customization, setCustomization] = useState<any>(null);
  const [pendingEmployeeRestore, setPendingEmployeeRestore] = useState<string | null>(null);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<{ enabled: boolean; mode: string }>({ enabled: false, mode: 'none' });
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; bookingId?: string; amount?: number; allowLater?: boolean; wasPaid?: boolean; openedOnce?: boolean }>({ open: false });
  const [isPaidOnce, setIsPaidOnce] = useState(false);

  useEffect(() => {
    applyTheme(getInitialTheme("client"));
  }, []);

  useEffect(() => {
    fetchCompanyAndServices();
    checkAuthState();
  }, [slug]);

  const checkAuthState = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      // Check if user is client in this company
      if (company) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('company_id', company.id)
          .single();

        if (clientData) {
          setClient(clientData);
        }
      }
    }
  };

  useEffect(() => {
    if (company) {
      checkAuthState();
    }
  }, [company]);

  useEffect(() => {
    if (selectedService) {
      fetchEmployeesForService();
    }
  }, [selectedService]);

  useEffect(() => {
    if (selectedEmployee && company && selectedService) {
      fetchAvailableDates();
    }
  }, [selectedEmployee, company, selectedService]);

  useEffect(() => {
    if (selectedDate && selectedEmployee && selectedService && company) {
      fetchAvailableTimes();
    }
  }, [selectedDate, selectedEmployee, selectedService, company]);

  // Apply dynamic theme customizations
  useEffect(() => {
    if (customization) {
      const themeData = typeof customization.theme === 'object' && customization.theme !== null
        ? customization.theme as Record<string, any>
        : {};

      const mergedCustomization = {
        ...customization,
        ...themeData
      };

      const bodyCfg = (mergedCustomization as any).body;
      const root = document.documentElement;

      if (bodyCfg) {
        // Apply body background
        const bgStyles = getBackgroundStyles(bodyCfg);
        if (bgStyles.backgroundColor) root.style.backgroundColor = bgStyles.backgroundColor as string;
        if (bgStyles.background) root.style.background = bgStyles.background as string;

        // Apply default typography variables
        if (bodyCfg.default_font_family) root.style.setProperty('--font-primary', bodyCfg.default_font_family);
        if (bodyCfg.default_text_color) root.style.setProperty('--text-color', bodyCfg.default_text_color);
        if (bodyCfg.max_width) root.style.setProperty('--max-width', `${bodyCfg.max_width}px`);
      } else {
        // Legacy fallbacks
        if (customization.primary_color) {
          root.style.setProperty('--primary', customization.primary_color);
        }
        if (customization.font_family) {
          root.style.setProperty('--font-primary', customization.font_family);
        }
      }
    }
  }, [customization]);

  // Restore booking state after login redirect - Phase 1: service, date, time
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const shouldRestore = searchParams.get('restore') === 'true';

    if (shouldRestore && user && services.length > 0) {
      const savedState = sessionStorage.getItem('pendingBooking');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);

          // Handle combo prefix ("combo:UUID") vs plain service UUID
          const savedId: string = state.serviceId || '';
          const isComboId = savedId.startsWith('combo:');
          const rawId = isComboId ? savedId.replace('combo:', '') : savedId;

          const service = !isComboId ? services.find(s => s.id === rawId) : null;
          const combo = isComboId ? combos.find(c => c.id === rawId) : null;

          if (service) {
            setSelectedService(service);
          } else if (combo) {
            const comboAsService: Service = {
              id: `combo:${combo.id}`,
              name: combo.name,
              description: combo.description || '',
              price: combo.price || combo.combo_price || 0,
              duration_minutes: combo.total_duration_minutes ?? (combo.items?.reduce((s: number, it: any) => s + (it.service?.duration_minutes || 0), 0) || 0),
              image_url: combo.image_url || combo.items?.[0]?.service?.image_url,
            };
            setSelectedService(comboAsService);
          }

          // Save employee ID for restoration in Phase 2
          if (state.employeeId) {
            setPendingEmployeeRestore(state.employeeId);
          }

          // Restore date and time
          if (state.date) setSelectedDate(new Date(state.date));
          if (state.time) setSelectedTime(state.time);

          // Go directly to step 5 (confirmation)
          setStep(5);

          // Clear saved state and URL param
          sessionStorage.removeItem('pendingBooking');
          window.history.replaceState({}, '', `/${slug}/agendar`);
        } catch (e) {
          console.error('Error restoring booking state:', e);
        }
      }
    }
  }, [user, services, combos, slug]);

  // Restore booking state - Phase 2: employee (after employees are loaded)
  useEffect(() => {
    if (pendingEmployeeRestore && employees.length > 0) {
      const employee = employees.find(e => e.id === pendingEmployeeRestore);
      if (employee) {
        setSelectedEmployee(employee);
      }
      setPendingEmployeeRestore(null);
    }
  }, [pendingEmployeeRestore, employees]);



  const fetchCompanyAndServices = async () => {
    try {
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name, slug')
        .eq('slug', slug)
        .single();

      if (companyError) throw companyError;
      if (!companyData) {
        navigate('/404');
        return;
      }

      setCompany(companyData);

      // Buscar personalização
      const { data: customizationData } = await supabase
        .from('company_customizations')
        .select('*')
        .eq('company_id', companyData.id)
        .maybeSingle();

      // Mescla o objeto `theme` (personalização V3) na raiz para que
      // os steps usem exatamente a mesma configuração da landing page.
      setCustomization(
        customizationData
          ? { ...customizationData, ...((customizationData as any).theme || {}) }
          : null
      );

      // Buscar configurações de pagamento da empresa
      const { data: paymentData } = await supabase
        .from('company_payment_settings')
        .select('payment_mode')
        .eq('company_id', companyData.id)
        .maybeSingle();
      const mode = paymentData?.payment_mode || 'none';
      setPaymentSettings({ enabled: mode !== 'none', mode });


      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('company_id', companyData.id)
        .eq('is_active', true);

      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      const { data: combosData, error: combosError } = await supabase
       .from('service_combos')
       .select('*, items:service_combo_items(*)')
       .eq('company_id', companyData.id)
       .eq('is_active', true)
       .order('name');

     if (combosError) {
       console.error('Error fetching combos:', combosError);
       setCombos([]);
     } else {
       // coletar ids de serviços usados nos combos
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
           .select('id, name, price, image_url, duration_minutes')
           .in('id', serviceIds);
         servicesMap = (servicesList || []).reduce((acc: any, s: any) => {
           acc[s.id] = s;
           return acc;
         }, {});
       }

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
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados da empresa.",
        variant: "destructive"
      });
    }
  };

  const generateCustomStyles = () => {
    if (!customization) return {};

    const styles: any = {};

    // Fonte
    if (customization.font_family) {
      styles['--font-family'] = customization.font_family;
    }

    if (customization.font_color_type === "gradient" && customization.font_gradient && customization.font_gradient.colors) {
      const direction = customization.font_gradient.direction || "to right";
      const colors = customization.font_gradient.colors.join(", ");
      styles['--font-color'] = `linear-gradient(${direction}, ${colors})`;
      styles['--font-gradient'] = true;
    } else if (customization.font_color) {
      styles['--font-color'] = customization.font_color;
      styles['--font-gradient'] = false;
    }

    // Cor dos cards (gradient ou cor sólida)
    if (
      customization.cards_color_type === "gradient" &&
      customization.cards_gradient &&
      customization.cards_gradient.colors &&
      customization.cards_gradient.colors.length > 1
    ) {
      const direction = customization.cards_gradient.direction || "to right";
      const colors = customization.cards_gradient.colors.join(", ");
      styles['--cards-background'] = `linear-gradient(${direction}, ${colors})`;
    } else if (customization.cards_color) {
      styles['--cards-background'] = customization.cards_color;
    }

    // Logo
    styles.logoUrl = customization.logo_url || null;

    return styles;
  };

  // Ao selecionar um combo no UI, criamos um "service-like" para manter o fluxo
  const handleSelectCombo = (combo: any) => {
    const synthetic: Service = {
      id: `combo:${combo.id}`,
      name: combo.name,
      description: combo.description || "",
      price: combo.price || combo.combo_price || 0,
      duration_minutes: combo.total_duration_minutes ?? (combo.items?.reduce((s: number, it: any) => s + (it.service?.duration_minutes || 0), 0) || 0),
      image_url: combo.items?.[0]?.service?.image_url
    };
    setSelectedService(synthetic);
  };

  const fetchEmployeesForService = async () => {
    if (!selectedService || !company) return;

    try {

      if (selectedService.id?.startsWith?.('combo:')) {
        const comboId = selectedService.id.replace('combo:', '');
        const combo = combos.find(c => c.id === comboId);
        if (!combo) {
          setEmployees([]);
          return;
        }

        const serviceIds = (combo.items || []).map((it: any) => it.service_id).filter(Boolean);
        if (serviceIds.length === 0) {
          setEmployees([]);
          return;
        }

        // buscar employee_services para esses serviceIds
        const { data: esData, error: esError } = await supabase
          .from('employee_services')
          .select('employee_id, service_id')
          .in('service_id', serviceIds);

        if (esError) throw esError;

        // contar quantos services cada employee possui
        const counts: Record<string, number> = {};
        (esData || []).forEach((row: any) => {
          counts[row.employee_id] = (counts[row.employee_id] || 0) + 1;
        });

        // employees que possuem count === serviceIds.length
        const eligibleEmployeeIds = Object.keys(counts).filter(empId => counts[empId] === serviceIds.length);
        if (eligibleEmployeeIds.length === 0) {
          setEmployees([]);
          return;
        }

         // buscar dados dos employees elegíveis (apenas do mesmo company)
        const { data: employeesData } = await supabase
          .from('employees')
          .select('id, name, avatar_url')
          .in('id', eligibleEmployeeIds)
          .eq('company_id', company.id)
          .eq('is_active', true);

        setEmployees(employeesData || []);
        return;
      }

      // Buscar funcionários que oferecem o serviço selecionado
      const { data: employeesData, error } = await supabase
        .from('employees')
        .select(`
          id,
          name,
          avatar_url,
          employee_services!inner(
            service_id
          )
        `)
        .eq('company_id', company.id)
        .eq('is_active', true)
        .eq('employee_services.service_id', selectedService.id);

      if (error) throw error;
      setEmployees(employeesData || []);
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os funcionários.",
        variant: "destructive"
      });
    }
  };

  const fetchAvailableDates = async () => {
    if (!selectedEmployee || !company || !selectedService) return;

    setIsLoadingAvailability(true);
    setAvailabilityReason(null);
    try {
      // Get dates from current month and next month
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const next30Days = Array.from({ length: 31 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        return d;
      });

      const datePromises = next30Days.map(async (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        try {
          if (selectedService.id?.startsWith?.('combo:')) {
            const comboId = selectedService.id.replace('combo:', '');
            const combo = combos.find(c => c.id === comboId);
            if (!combo) return { date: null, reason: 'service_not_found', error: null };
            const serviceIds = (combo.items || []).map((it: any) => it.service_id).filter(Boolean);

            if (serviceIds.length > 0) {
              const { slots, reason, error } = await getAvailability({
                data: {
                  company_id: company.id,
                  service_id: serviceIds[0],
                  employee_id: selectedEmployee.id,
                  date: dateStr
                }
              });
              if (slots && !error && slots.length > 0) {
                return { date, reason: null, error: null };
              }
              return { date: null, reason: reason ?? null, error: error ?? null };
            }
            return { date: null, reason: 'service_not_found', error: null };
          }

          const { slots, reason, error } = await getAvailability({
            data: {
              company_id: company.id,
              service_id: selectedService.id,
              employee_id: selectedEmployee.id,
              date: dateStr
            }
          });

          if (slots && !error && slots.length > 0) {
            return { date, reason: null, error: null };
          }
          return { date: null, reason: reason ?? null, error: error ?? null };
        } catch (err) {
          return {
            date: null,
            reason: 'error',
            error: err instanceof Error ? err.message : 'Erro ao consultar disponibilidade',
          };
        }
      });

      const results = await Promise.all(datePromises);
      const availableDateResults = results.map((result) => result.date).filter((d): d is Date => d !== null);
      setAvailableDates(availableDateResults);

      if (availableDateResults.length === 0) {
        const firstProblem = results.find((result) => result.error || result.reason);
        setAvailabilityReason(firstProblem?.reason ?? null);
      }
    } catch (error) {
      console.error("Erro ao carregar datas disponíveis:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as datas disponíveis.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const fetchAvailableTimes = async () => {
    if (!selectedDate || !selectedEmployee || !selectedService || !company) return;

    setIsLoadingAvailability(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      if (selectedService.id?.startsWith?.('combo:')) {
        const comboId = selectedService.id.replace('combo:', '');
        const combo = combos.find(c => c.id === comboId);
        const firstServiceId = combo?.items?.[0]?.service_id;
        if (!firstServiceId) {
          setAvailableTimes([]);
          return;
        }

        const { slots, error } = await getAvailability({
          data: {
            company_id: company.id,
            service_id: firstServiceId,
            employee_id: selectedEmployee.id,
            date: dateStr
          }
        });

        if (error) throw new Error(error);

        if (slots && slots.length > 0) {
          setAvailableTimes(slots.map((s: any) => typeof s === 'string' ? s : s.time));
          return;
        } else {
          setAvailableTimes([]);
          return;
        }

      }

      const { slots, reason, error } = await getAvailability({
        data: {
          company_id: company.id,
          service_id: selectedService.id,
          employee_id: selectedEmployee.id,
          date: dateStr
        }
      });

      if (error && !slots) throw new Error(error);

      setAvailabilityReason(reason ?? null);
      if (slots && slots.length > 0) {
        setAvailableTimes(slots.map((slot: any) => typeof slot === 'string' ? slot : slot.time));
      } else {
        setAvailableTimes([]);
      }


    } catch (error) {
      console.error("Erro ao carregar horários:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os horários disponíveis.",
        variant: "destructive"
      });
      setAvailableTimes([]);
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBookingSubmit = async () => {
    if (!selectedService || !selectedEmployee || !selectedDate || !selectedTime || !company) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    setIsLoading(true);
    try {
      let clientId;

      if (user && client) {
        clientId = client.id;
      } else {
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .upsert([
            {
              company_id: company.id,
              name: formData.client_name,
              email: formData.client_email,
              phone: formData.client_phone
            }
          ], {
            onConflict: 'company_id,email',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (clientError) throw clientError;
        clientId = clientData.id;
      }

      const isCombo = selectedService.id?.startsWith?.('combo:');
      const bookingDate = format(selectedDate, 'yyyy-MM-dd');
      const [shStr, smStr] = (selectedTime || '00:00').split(':');
      const sh = Number(shStr) || 0;
      const sm = Number(smStr) || 0;
      const duration = Number(selectedService.duration_minutes) || 30;
      const normalizedSelectedTime = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;
      const startISO = `${bookingDate}T${normalizedSelectedTime}:00-03:00`;
      const endISO = new Date(new Date(startISO).getTime() + duration * 60000).toISOString();

      const payloadBase: any = {
        company_id: company.id,
        employee_id: selectedEmployee.id,
        service_id: isCombo ? null : selectedService.id,
        combo_id: isCombo ? selectedService.id.replace('combo:', '') : null,
        booking_time: `${normalizedSelectedTime}:00`,
        start_time: startISO,
        end_time: endISO,
        booking_date: bookingDate,
        duration_minutes: duration,
        price: selectedService.price,
        notes: formData.notes,
        client_id: clientId,
        booking_status: 'pending'
      };

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert([payloadBase])
        .select()
        .single();

      if (bookingError) {
        console.error("Booking insert error:", bookingError);
        throw new Error(bookingError.message || 'Erro ao criar agendamento. Tente novamente.');
      }
      const newBookingId = bookingData.id;
      setCreatedBookingId(newBookingId);

      if (newBookingId) {
        supabase.functions
          .invoke('notify-booking-event', {
            body: { booking_id: newBookingId, event_key: 'booking_pending' },
          })
          .catch((err) => console.warn('[notify-booking-event] pending failed:', err));
      }

      // Pagamento online habilitado → abre o diálogo de pagamento direto,
      // sem precisar do passo 6/7 manual.
      if (paymentSettings.enabled && paymentSettings.mode !== 'none' && newBookingId) {
        setPaymentDialog({
          open: true,
          bookingId: newBookingId,
          amount: selectedService?.price || 0,
          allowLater: true,
          openedOnce: true,
        });
      } else {
        setStep(6);
      }
      toast({
        title: "Agendamento realizado!",
        description: "Seu agendamento foi registrado com sucesso."
      });
    } catch (error) {
      console.error("Erro ao criar agendamento:", error);
      toast({
        title: "Erro",
        description: "Não foi possível realizar o agendamento. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
      setIsLoading(false);
    }
  };

  const openPaymentDialog = () => {
    if (!createdBookingId || !company) return;
    setPaymentDialog({
      open: true,
      bookingId: createdBookingId,
      amount: selectedService?.price || 0,
      allowLater: true,
      openedOnce: true,
    });
  };

  /**
   * Aplica ao card do step exatamente a configuração salva em Personalização
   * para a section correspondente (services / professionals).
   */
  const stepCardStyles = (section: "services" | "professionals"): Record<string, any> => {
    const cfg = customization?.[section]?.cards;
    const styles: Record<string, any> = { ...getCardStyles(cfg) };
    if (!cfg?.has_border) delete styles.border;
    if (!styles.background && !styles.backgroundColor) {
      styles.background = customStyles["--cards-background"];
    }
    if (!styles.fontFamily && customStyles["--font-family"]) {
      styles.fontFamily = customStyles["--font-family"];
    }
    return styles;
  };

  const stepCardTypography = (
    section: "services" | "professionals",
    key: "title_typography" | "description_typography" | "price_typography"
  ) => getTypographyStyles(customization?.[section]?.cards?.[key], customization?.body);


  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20" style={stepContainerBase(cfgServices)}>
            <CardHeader>
              <CardTitle style={stepTitleStyle(cfgServices.title_typography)}>
                {cfgServices.title_typography?.text || 'Escolha o Serviço'}
              </CardTitle>
              <CardDescription style={stepTitleStyle(cfgServices.description_typography)}>
                {cfgServices.description_typography?.text || 'Selecione o serviço desejado'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4" >
                {combos.map((combo) => {
                  const synthetic: Service = {
                    id: `combo:${combo.id}`,
                    name: combo.name,
                    description: combo.description || '',
                    price: combo.price || combo.combo_price || 0,
                    duration_minutes: combo.total_duration_minutes ?? (combo.items?.reduce((s: number, it: any) => s + (it.service?.duration_minutes || 0), 0) || 0),
                    image_url: combo.items?.[0]?.service?.image_url
                  };
                  return (
                    <div
                      key={`combo-${combo.id}`}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedService?.id === synthetic.id ? "border-primary bg-primary/10" : "border-primary/20 hover:border-primary/50"}`}
                      style={stepCardStyles("services")}
                      onClick={() => handleSelectCombo(combo)}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex gap-3 flex-1 min-w-0">
                          {(combo.image_url || synthetic.image_url) && (
                            <img
                              src={combo.image_url || synthetic.image_url}
                              alt={combo.name}
                              className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <h3 style={stepCardTypography("services", "title_typography")} className="font-semibold text-lg">{combo.name}</h3>
                            <p style={stepCardTypography("services", "description_typography")} className="text-muted-foreground text-sm mb-2">{combo.description}</p>

                            <div className="flex gap-4 text-sm flex-wrap">
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {synthetic.duration_minutes} min
                              </div>
                              <div className="flex items-center gap-1" style={stepCardTypography("services", "price_typography")}>
                                <DollarSign className="w-4 h-4" />
                                R$ {synthetic.price.toFixed(2)}
                              </div>

                            </div>
                          </div>
                        </div>
                        {selectedService?.id === synthetic.id && (
                          <Check className="w-6 h-6 flex-shrink-0" style={{ color: stepCheckColor(cfgServices) }} />
                        )}
                      </div>
                    </div>
                  );
                })}
                {services.map((service) => (
                  <div
                    key={service.id}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedService?.id === service.id
                        ? "border-primary bg-primary/10"
                        : "border-primary/20 hover:border-primary/50"
                    } `}
                    style={stepCardStyles("services")}

                    onClick={() => setSelectedService(service)}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex gap-3 flex-1 min-w-0">
                        {service.image_url && (
                          <img
                            src={service.image_url}
                            alt={service.name}
                            className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <h3 style={stepCardTypography("services", "title_typography")} className="font-semibold text-lg">{service.name}</h3>
                          <p style={stepCardTypography("services", "description_typography")} className="text-muted-foreground text-sm mb-2">{service.description}</p>
                          <div className="flex gap-4 text-sm flex-wrap">
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {service.duration_minutes} min
                            </div>
                            <div className="flex items-center gap-1" style={stepCardTypography("services", "price_typography")}>
                              <DollarSign className="w-4 h-4" />
                              R$ {service.price.toFixed(2)}
                            </div>

                          </div>
                        </div>
                      </div>
                      {selectedService?.id === service.id && (
                        <Check className="w-6 h-6 flex-shrink-0" style={{ color: stepCheckColor(cfgServices) }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {selectedService && (
                <Button onClick={() => setStep(2)} className="w-full mt-4" style={stepBtnStyle(cfgServices.continue_button)}>
                  {cfgServices.continue_button?.typography?.text || 'Continuar'}
                </Button>
              )}
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20" style={stepContainerBase(cfgProfessional)}>
            <CardHeader>
              <CardTitle style={stepTitleStyle(cfgProfessional.title_typography)}>
                {cfgProfessional.title_typography?.text || 'Escolha o Profissional'}
              </CardTitle>
              <CardDescription style={stepTitleStyle(cfgProfessional.description_typography)}>
                {cfgProfessional.description_typography?.text || 'Selecione quem irá realizar o atendimento'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {employees.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum profissional disponível para este serviço.
                  </p>
                ) : (
                  employees.map((employee) => (
                    <div
                      key={employee.id}
                      style={stepCardStyles("professionals")}

                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedEmployee?.id === employee.id
                          ? "border-primary bg-primary/10"
                          : "border-primary/20 hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedEmployee(employee)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center overflow-hidden">
                            {employee.avatar_url ? (
                              <img src={employee.avatar_url} alt={employee.name} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <h3 style={stepCardTypography("professionals", "title_typography")} className="font-semibold text-lg">{employee.name}</h3>
                          </div>
                        </div>
                        {selectedEmployee?.id === employee.id && (
                          <Check className="w-6 h-6" style={{ color: stepCheckColor(cfgProfessional) }} />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <Button variant="outline" onClick={() => {
                  setSelectedEmployee(null);
                  setEmployees([]);
                  setAvailableDates([]);
                  setSelectedDate(undefined);
                  setAvailableTimes([]);
                  setSelectedTime("");
                  setStep(1);
                }} className="flex-1" style={stepBtnStyle(cfgProfessional.back_button)}>
                  {cfgProfessional.back_button?.typography?.text || 'Voltar'}
                </Button>
                {selectedEmployee && (
                  <Button onClick={() => setStep(3)} className="flex-1" style={stepBtnStyle(cfgProfessional.continue_button)}>
                    {cfgProfessional.continue_button?.typography?.text || 'Continuar'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20" style={stepContainerBase(cfgCalendar)}>
            <CardHeader>
              <CardTitle style={stepTitleStyle(cfgCalendar.title_typography)}>
                {cfgCalendar.title_typography?.text || 'Escolha a Data'}
              </CardTitle>
              <CardDescription style={stepTitleStyle(cfgCalendar.description_typography)}>
                {cfgCalendar.description_typography?.text || 'Selecione uma data disponível'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-base font-medium">Datas disponíveis</Label>
                {isLoadingAvailability ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3 text-muted-foreground">Buscando disponibilidade...</span>
                  </div>
                ) : availableDates.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {AVAILABILITY_REASON_LABELS[availabilityReason ?? 'no_slots'] ?? 'Nenhuma data disponível nos próximos 30 dias.'}
                  </p>
                ) : (
                  <div className="flex justify-center py-4">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      locale={ptBR}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today || !availableDates.some(availableDate =>
                          availableDate.toDateString() === date.toDateString()
                        );
                      }}
                      className="rounded-xl border-2 border-primary/30 bg-background/50 p-4 md:p-6 shadow-lg [&_.rdp-months]:justify-center [&_table]:w-full [&_.rdp-cell]:h-12 [&_.rdp-cell]:w-12 md:[&_.rdp-cell]:h-14 md:[&_.rdp-cell]:w-14 [&_.rdp-head_cell]:w-12 md:[&_.rdp-head_cell]:w-14 [&_button]:h-11 [&_button]:w-11 md:[&_button]:h-12 md:[&_button]:w-12 [&_button]:text-base [&_.rdp-caption_label]:text-lg [&_.rdp-nav_button]:h-9 [&_.rdp-nav_button]:w-9"
                    />
                    <style>{`
                      .rdp-day_available:not(.rdp-day_selected) {
                        background-color: ${cfgCalendar.available_date_color || '#3b82f6'}20 !important;
                        color: ${cfgCalendar.available_date_color || '#3b82f6'} !important;
                      }
                      .rdp-day_selected {
                        background-color: ${cfgCalendar.current_date_color || '#8b5cf6'} !important;
                        color: #fff !important;
                      }
                      .rdp-day_unavailable {
                        background-color: ${cfgCalendar.unavailable_date_color || '#cbd5e1'} !important;
                        color: #94a3b8 !important;
                        opacity: 0.5;
                      }
                      .rdp-head_cell {
                        color: ${cfgCalendar.weekday_color || '#64748b'} !important;
                        font-weight: 600;
                      }
                      .rdp-caption_label {
                        color: ${cfgCalendar.calendar_header_color || '#1e293b'} !important;
                      }
                      .rdp-nav_button {
                        color: ${cfgCalendar.calendar_nav_button_color || '#3b82f6'} !important;
                      }
                    `}</style>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setSelectedEmployee(null);
                  setAvailableDates([]);
                  setSelectedDate(undefined);
                  setAvailableTimes([]);
                  setSelectedTime("");
                  setStep(2);
                }} className="flex-1" style={stepBtnStyle(cfgCalendar.back_button)}>
                  {cfgCalendar.back_button?.typography?.text || 'Voltar'}
                </Button>
                {selectedDate && (
                  <Button onClick={() => setStep(4)} className="flex-1" style={stepBtnStyle(cfgCalendar.continue_button)}>
                    {cfgCalendar.continue_button?.typography?.text || 'Continuar'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 4:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20" style={stepContainerBase(cfgSlots)}>
            <CardHeader>
              <CardTitle style={stepTitleStyle(cfgSlots.title_typography)}>
                {cfgSlots.title_typography?.text || 'Escolha o Horário'}
              </CardTitle>
              <CardDescription style={stepTitleStyle(cfgSlots.description_typography)}>
                {cfgSlots.description_typography?.text || 'Selecione um horário disponível'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingAvailability ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-3 text-muted-foreground">Buscando horários...</span>
                </div>
              ) : availableTimes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {AVAILABILITY_REASON_LABELS[availabilityReason ?? 'no_slots'] ?? 'Nenhum horário disponível para esta data.'}
                </p>

              ) : (
                <div>
                  <Label className="text-base font-medium">Horários disponíveis</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2" style={{ fontFamily: customStyles["--font-family"] }}>
                    {availableTimes.map((time) => {
                      const isSelected = selectedTime === time;
                      return (
                        <Button
                          key={time}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedTime(time)}
                          style={{
                            borderRadius: cfgSlots.slot_border_radius != null ? `${cfgSlots.slot_border_radius}px` : '8px',
                            background: isSelected ? (cfgSlots.slot_selected_color || '#3b82f6') : (customStyles["--cards-background"] || '#ffffff'),
                            color: isSelected ? '#ffffff' : undefined,
                            fontFamily: customStyles["--font-family"],
                          }}
                        >
                          {time}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setSelectedTime("");
                  setAvailableTimes([]);
                  setStep(3);
                }} className="flex-1" style={stepBtnStyle(cfgSlots.back_button)}>
                  {cfgSlots.back_button?.typography?.text || 'Voltar'}
                </Button>
                {selectedTime && (
                  <Button onClick={() => setStep(5)} className="flex-1" style={stepBtnStyle(cfgSlots.continue_button)}>
                    {cfgSlots.continue_button?.typography?.text || 'Continuar'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 5:
        if (user && client) {
          return (
            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20" style={stepContainerBase(cfgLogin)}>
              <CardHeader>
                <CardTitle style={stepTitleStyle(cfgLogin.title_typography)}>
                  {cfgLogin.title_typography?.text || 'Confirmação dos Dados'}
                </CardTitle>
                <CardDescription style={stepTitleStyle(cfgLogin.description_typography)}>
                  {cfgLogin.description_typography?.text || 'Confirme seus dados para o agendamento'}
                </CardDescription>
              </CardHeader>
              <CardContent >
                <div className="space-y-4">
                  <div className="bg-background/30 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Serviço:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>{selectedService?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Profissional:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>{selectedEmployee?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>
                        {selectedDate && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Horário:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>{selectedTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duração:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>{selectedService?.duration_minutes} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>R$ {selectedService?.price.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações (opcional)</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      placeholder="Alguma observação especial?"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button variant="outline" onClick={() => { setSelectedTime(""); setStep(4); }} className="flex-1" style={stepBtnStyle(cfgLogin.back_button)}>
                    {cfgLogin.back_button?.typography?.text || 'Voltar'}
                  </Button>
                  <Button onClick={handleBookingSubmit} disabled={isLoading} className="flex-1" style={stepBtnStyle(cfgLogin.continue_button)}>
                    {isLoading ? (cfgLogin.continue_button?.typography?.text || 'Agendando...') : (cfgLogin.continue_button?.typography?.text || 'Confirmar Agendamento')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        } else {
          return (
            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20" style={stepContainerBase(cfgLogin)}>
              <CardHeader className="text-center">
                <CardTitle style={stepTitleStyle(cfgLogin.title_typography)}>
                  {cfgLogin.title_typography?.text || 'Acesso Necessário'}
                </CardTitle>
                <CardDescription style={stepTitleStyle(cfgLogin.description_typography)}>
                  {cfgLogin.description_typography?.text || 'Para continuar com o agendamento, faça login ou crie sua conta'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">Com sua conta você poderá:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 text-left">
                    <li>• Acompanhar seus agendamentos</li>
                    <li>• Gerenciar seus dados</li>
                    <li>• Receber lembretes por email</li>
                    <li>• Histórico de serviços</li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <Button className="w-full" style={stepBtnStyle(cfgLogin.continue_button)} onClick={() => {
                    const bookingState = { serviceId: selectedService?.id, employeeId: selectedEmployee?.id, date: selectedDate?.toISOString(), time: selectedTime };
                    sessionStorage.setItem('pendingBooking', JSON.stringify(bookingState));
                    navigate(`/${slug}/entrar?returnTo=agendar`);
                  }}>
                    {cfgLogin.continue_button?.typography?.text || 'Já tenho conta - Entrar'}
                  </Button>
                  <Button className="w-full" style={stepBtnStyle(cfgLogin.secondary_button)} onClick={() => {
                    const bookingState = { serviceId: selectedService?.id, employeeId: selectedEmployee?.id, date: selectedDate?.toISOString(), time: selectedTime };
                    sessionStorage.setItem('pendingBooking', JSON.stringify(bookingState));
                    navigate(`/${slug}/cadastro?returnTo=agendar`);
                  }}>
                    {cfgLogin.secondary_button?.typography?.text || 'Criar nova conta'}
                  </Button>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button variant="ghost" onClick={() => { setSelectedTime(""); setStep(4); }} className="flex-1" style={stepBtnStyle(cfgLogin.back_button)}>
                    {cfgLogin.back_button?.typography?.text || 'Voltar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        }

      case 6:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20" style={stepContainerBase(cfgConfirm)}>
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <CardTitle style={stepTitleStyle(cfgConfirm.title_typography)}>
                {cfgConfirm.title_typography?.text || 'Agendamento Confirmado!'}
              </CardTitle>
              <CardDescription style={stepTitleStyle(cfgConfirm.description_typography)}>
                {cfgConfirm.description_typography?.text || 'Seu agendamento foi registrado com sucesso'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-background/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serviço:</span>
                  <span className="font-medium">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profissional:</span>
                  <span className="font-medium">{selectedEmployee?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium">
                    {selectedDate && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Horário:</span>
                  <span className="font-medium">{selectedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duração:</span>
                  <span className="font-medium">{selectedService?.duration_minutes} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-medium">R$ {selectedService?.price.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Você receberá um e-mail de confirmação em breve.
                </p>
                <Badge
                  variant={isPaidOnce ? "default" : "secondary"}
                  className={isPaidOnce ? "bg-green-500 hover:bg-green-600" : ""}
                >
                  {isPaidOnce
                    ? "Pago"
                    : paymentSettings.enabled
                      ? "Aguardando pagamento"
                      : "Aguardando confirmação"}
                </Badge>
              </div>

              {paymentSettings.enabled && createdBookingId && !isPaidOnce && (
                <Button
                  onClick={openPaymentDialog}
                  className="w-full"
                  variant="neon"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {paymentDialog.openedOnce ? "Continuar Pagamento" : "Pagar agora"}
                </Button>
              )}

              <Button
                onClick={() => navigate(`/${slug}`)}
                className="w-full"
                variant={paymentSettings.enabled && createdBookingId && !paymentDialog.wasPaid ? "outline" : "neon"}
              >
                Voltar ao Início
              </Button>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  if (!company) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  const customStyles = generateCustomStyles();

  // --- Steps customization helpers ---
  const steps = customization?.steps || {};
  const cfgServices = steps.services || {};
  const cfgProfessional = steps.professional || {};
  const cfgCalendar = steps.calendar || {};
  const cfgSlots = steps.slots || {};
  const cfgLogin = steps.login || {};
  const cfgConfirm = steps.confirmation || {};

  const stepContainerBase = (cfg: any): React.CSSProperties => ({
    background: cfg?.container_background_type === 'gradient' && cfg?.container_background_gradient
      ? `linear-gradient(${cfg.container_background_gradient.angle || 0}deg, ${cfg.container_background_gradient.colors?.join(', ') || ''})`
      : cfg?.container_background_color || '#ffffff',
    borderRadius: cfg?.container_border_radius != null ? `${cfg.container_border_radius}px` : '12px',
  });

  const stepBtnStyle = (cfg: any, isHover = false): React.CSSProperties => {
    if (!cfg) return { backgroundColor: '#3b82f6', color: '#fff', borderRadius: '8px', padding: '10px 24px' };
    return getButtonStyles(cfg, isHover);
  };

  const stepTitleStyle = (cfg: any): React.CSSProperties => getTypographyStyles(cfg, customization?.body);
  const stepCheckColor = (cfg: any) => cfg?.check_color || '#3b82f6';


  let logoSrc = customStyles.logoUrl;
  if (!logoSrc && customization?.logo_upload_path) {
    logoSrc = supabase.storage
      .from('company-logos')
      .getPublicUrl(customization.logo_upload_path).data.publicUrl;
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="border-b border-primary/20 bg-card/30 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {logoSrc && (
                <img src={logoSrc} alt={company.name} className="w-12 h-12 object-contain border-2 border-blue-600" />
              )}
              <div>
                <h1 className="text-xl font-bold">{company.name}</h1>
                <p className="text-sm text-muted-foreground">Agendamento Online</p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => navigate(`/${slug}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderStep()}
      </div>

      {paymentDialog.open && paymentDialog.bookingId && company && (
        <BookingPaymentDialog
          open={paymentDialog.open}
          onClose={() => {
            console.log("[BOOKING] Closing payment dialog. Current wasPaid:", paymentDialog.wasPaid);
            setPaymentDialog(prev => ({ ...prev, open: false }));
          }}
          bookingId={paymentDialog.bookingId}
          companyId={company.id}
          amount={paymentDialog.amount || 0}
          payerInitial={{
            name: client?.name || formData.client_name,
            email: client?.email || formData.client_email,
            phone: client?.phone || formData.client_phone,
            cpf_cnpj: client?.cpf,
          }}
          allowPayLater={paymentDialog.allowLater}
          onPayLater={() => {
            console.log("[BOOKING] Pay later selected.");
            setPaymentDialog(prev => ({ ...prev, open: false, wasPaid: false }));
            setStep(6);
            toast({
              title: "Tudo certo!",
              description: "Você poderá pagar no local do atendimento.",
            });
          }}
          onPaid={() => {
            console.log("[BOOKING] Payment confirmed callback.");
            setPaymentDialog(prev => ({ ...prev, wasPaid: true }));
            setIsPaidOnce(true);
            setStep(6);
            toast({
              title: "Pagamento confirmado!",
              description: "Seu agendamento foi validado.",
            });
          }}
        />
      )}
    </div>
  );
}
