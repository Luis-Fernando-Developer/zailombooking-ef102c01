import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { ClientSidebar } from "./ClientSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Calendar, Clock, DollarSign, RefreshCw, X, MoreVertical, User } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { ClientRescheduleDialog } from "./ClientRescheduleDialog";
import { ClientCancelDialog } from "./ClientCancelDialog";
import { ClientNotificationsBell } from "./ClientNotificationsBell";

interface Booking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  booking_status: string;
  notes?: string;
  service_id: string;
  employee_id?: string;
  service: {
    name: string;
    description?: string;
    duration_minutes?: number;
    price?: number;
  };
  employee?: { name: string } | null;
  company: {
    name: string;
    slug: string;
    logo_url?: string | null;
    min_reschedule_hours?: number | null;
    allow_client_reschedule?: boolean | null;
    allow_client_cancel?: boolean | null;
  };
}

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  min_reschedule_hours?: number | null;
  allow_client_reschedule?: boolean | null;
  allow_client_cancel?: boolean | null;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  confirmed: { label: "Confirmado", variant: "default" },
  completed: { label: "Concluído", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  no_show: { label: "Não compareceu", variant: "destructive" },
};

export default function ClientLayout() {
  const formatTime = (time: string) => {
    if (!time) return "--:--";
    if (time.includes('T')) {
      const timePart = time.split('T')[1];
      return timePart.substring(0, 5);
    }
    return time.substring(0, 5);
  };
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);

  useEffect(() => {
    fetchCompany();
  }, [slug]);

  useEffect(() => {
    if (company) {
      fetchClientAndBookings();
    }
  }, [company]);

  const fetchCompany = async () => {
    try {
      const { data: companyData, error } = await supabase
        .from('companies')
        .select('id, name, slug, logo_url, min_reschedule_hours, allow_client_reschedule, allow_client_cancel')
        .eq('slug', slug)
        .single();

      if (error) throw error;
      if (!companyData) {
        navigate('/404');
        return;
      }

      setCompany(companyData);
    } catch (error) {
      console.error("Erro ao carregar empresa:", error);
      navigate('/404');
    }
  };

  const fetchClientAndBookings = async () => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        navigate(`/${slug}/entrar`);
        setIsLoading(false);
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('company_id', company?.id)
        .single();

      if (clientError || !clientData) {
        toast({
          title: "Acesso negado",
          description: "Usuário não está cadastrado como cliente.",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        navigate(`/${slug}/entrar`);
        setIsLoading(false);
        return;
      }

      setClient(clientData);

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          service:services(name, description, duration_minutes, price),
          employee:employees(name),
          company:companies(name, slug, logo_url, min_reschedule_hours, allow_client_reschedule, allow_client_cancel)
        `)
        .eq('client_id', clientData.id)
        .order('booking_date', { ascending: false });

      if (bookingsError) throw bookingsError;

      setBookings(bookingsData || []);
    } catch (error) {
      console.error("Erro ao buscar dados do cliente/agendamentos:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os agendamentos.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ booking_status: 'cancelled' })
        .eq('id', bookingId);

      if (error) throw error;

      setBookings(prev => 
        prev.map(booking => 
          booking.id === bookingId 
            ? { ...booking, booking_status: 'cancelled' }
            : booking
        )
      );

      setCancelBooking(null);

      toast({
        title: "Agendamento cancelado",
        description: "Seu agendamento foi cancelado com sucesso."
      });
    } catch (error) {
      console.error("Erro ao cancelar agendamento:", error);
      toast({
        title: "Erro",
        description: "Não foi possível cancelar o agendamento.",
        variant: "destructive"
      });
    }
  };

  const handleRescheduleSuccess = () => {
    setRescheduleBooking(null);
    fetchClientAndBookings();
    toast({
      title: "Agendamento reagendado",
      description: "Seu agendamento foi reagendado com sucesso."
    });
  };

  const canModifyBooking = (booking: Booking) => {
    // Bloqueia apenas estados terminais/em-execução
    const terminal = ['completed', 'cancelled', 'no_show', 'in_progress'];
    if (terminal.includes(booking.booking_status)) return false;

    // Não permitir alterar agendamentos no passado
    const [year, month, day] = booking.booking_date.split('-').map(Number);
    const [hours, minutes] = booking.start_time.split(':').map(Number);
    const bookingDateTime = new Date(year, month - 1, day, hours, minutes);
    const now = new Date();
    if (bookingDateTime.getTime() <= now.getTime()) return false;

    // Respeitar janela mínima da empresa (default 2h)
    if (company?.allow_client_reschedule === false) return false;
    const minHours = company?.min_reschedule_hours ?? 2;
    const minMs = minHours * 60 * 60 * 1000;
    return (bookingDateTime.getTime() - now.getTime()) >= minMs;
  };

  const parseHM = (time?: string): [number, number] => {
    if (!time) return [0, 0];
    let s = time;
    if (s.includes('T')) s = s.split('T')[1];
    // strip timezone suffix if any
    s = s.replace(/[zZ].*$/, '').replace(/[+\-]\d{2}:?\d{2}$/, '');
    const [hh, mm] = s.split(':');
    return [Number(hh) || 0, Number(mm) || 0];
  };

  const formatLongDate = (date: string, time: string) => {
    if (!date) return "";
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mi] = parseHM(time);
    const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const dd = String(d).padStart(2, '0');
    return `${dd} de ${months[m - 1]} de ${y} às ${String(hh).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
  };

  return (
    <SidebarProvider className="min-h-screen flex w-full">
      <ClientSidebar
        clientId={client?.id || "N/A"}
        clientName={client?.name || null}
        clientAvatarUrl={client?.avatar_url || null}
        currentUser={null}
        companySlug={company?.slug || ""}
        companyName={company?.name || ""}
        companyId={company?.id || ""}
        companyLogoUrl={(company as any)?.logo_url || null}
      />

      <div className="flex flex-col flex-1 h-screen overflow-hidden">
        <header className="h-20 shrink-0 w-full flex items-center border-b border-primary/20 bg-card/30 backdrop-blur-md px-6 z-20">
          <SidebarTrigger className="text-foreground hover:bg-primary/10 mr-4" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-gradient">Meus Agendamentos</h1>
            <p className="text-xs text-muted-foreground">Histórico e gerenciamento</p>
          </div>
          <div className="ml-auto">
            <ClientNotificationsBell companyId={company?.id} />
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-gradient-hero">




          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Resumo da sua conta</h2>
                <p className="text-muted-foreground">
                  Você possui <span className="text-primary font-bold">{bookings.length}</span> agendamentos registrados.
                </p>
              </div>
              <Button 
                variant="neon" 
                className="w-full md:w-auto shadow-neon hover:shadow-neon-strong transition-all"
                onClick={() => navigate(`/${company?.slug}/agendar`)}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Novo Agendamento
              </Button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground animate-pulse">Carregando seus agendamentos...</p>
              </div>
            ) : bookings.length === 0 ? (
              <Card className="bg-card/40 border-primary/10 p-12 text-center">
                <div className="w-20 h-20 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Calendar className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold mb-2">Nenhum agendamento ainda</h3>
                <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                  Parece que você ainda não realizou nenhum agendamento na {company?.name}.
                </p>
                <Button 
                  variant="neon" 
                  onClick={() => navigate(`/${company?.slug}/agendar`)}
                >
                  Fazer meu primeiro agendamento
                </Button>
              </Card>
            ) : (
              <div className="grid gap-6">
                {bookings.map((booking) => (
                  <Card 
                    key={booking.id} 
                    className="group overflow-hidden bg-card/40 border-primary/10 hover:border-primary/30 transition-all duration-300 card-glow"
                  >
                    <div className="p-6">
                      <div className="flex flex-col lg:flex-row justify-between gap-6">
                        <div className="flex gap-5">
                          <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-neon-pink/20 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                            <Calendar className="w-8 h-8 text-primary" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="font-bold text-xl group-hover:text-primary transition-colors">{booking.service?.name}</h3>
                              <Badge 
                                variant={statusLabels[booking.booking_status]?.variant || "outline"}
                                className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                  booking.booking_status === 'confirmed' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                  booking.booking_status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                  booking.booking_status === 'cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''
                                }`}
                              >
                                {statusLabels[booking.booking_status]?.label || booking.booking_status}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm bg-background/40 px-3 py-1 rounded-lg w-fit">
                              <Calendar className="h-4 w-4 text-primary" />
                              <span className="font-medium text-foreground">
                                {formatLongDate(booking.booking_date, booking.start_time)}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-2 gap-x-6">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <User className="h-4 w-4 text-primary" />
                                <span className="font-medium text-foreground">
                                  {booking.employee?.name || 'Profissional a definir'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                {booking.service?.duration_minutes || 30} min
                              </div>
                              <div className="flex items-center gap-2 text-sm font-bold text-green-500">
                                <DollarSign className="h-4 w-4" />
                                R$ {(booking.service?.price || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 hover:bg-primary/10 rounded-full transition-colors outline-none">
                                <MoreVertical className="h-5 w-5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-card/95 backdrop-blur-md border-primary/20">
                              {canModifyBooking(booking) ? (
                                <>
                                  <DropdownMenuItem 
                                    className="cursor-pointer focus:bg-primary/10 flex items-center gap-2"
                                    onClick={() => setRescheduleBooking(booking)}
                                  >
                                    <RefreshCw className="h-4 w-4 text-primary" />
                                    <span>Reagendar</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="cursor-pointer focus:bg-destructive/10 text-destructive focus:text-destructive flex items-center gap-2"
                                    onClick={() => setCancelBooking(booking)}
                                  >
                                    <X className="h-4 w-4" />
                                    <span>Cancelar</span>
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem disabled className="text-xs italic text-muted-foreground">
                                  Alteração não permitida
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {booking.notes && (
                        <div className="mt-6 p-4 bg-muted/10 border-l-2 border-primary/40 rounded-r-xl text-sm italic text-muted-foreground">
                          <span className="font-bold text-primary not-italic mr-2">Observação:</span>
                          {booking.notes}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
          </main>
        </div>


      {rescheduleBooking && company && (
        <ClientRescheduleDialog
          booking={rescheduleBooking}
          companyId={company.id}
          open={!!rescheduleBooking}
          onOpenChange={(open) => !open && setRescheduleBooking(null)}
          onSuccess={handleRescheduleSuccess}
        />
      )}

      {cancelBooking && (
        <ClientCancelDialog
          booking={cancelBooking}
          open={!!cancelBooking}
          onOpenChange={(open) => !open && setCancelBooking(null)}
          onSuccess={() => {
            setCancelBooking(null);
            fetchClientAndBookings();
          }}
        />
      )}
    </SidebarProvider>
  );
}