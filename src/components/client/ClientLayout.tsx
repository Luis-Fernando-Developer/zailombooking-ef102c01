import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { ClientSidebar } from "./ClientSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Calendar, Clock, DollarSign, RefreshCw, X } from "lucide-react";
import { ClientRescheduleDialog } from "./ClientRescheduleDialog";
import { ClientCancelDialog } from "./ClientCancelDialog";

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
  company: {
    name: string;
    slug: string;
  };
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  confirmed: { label: "Confirmado", variant: "default" },
  completed: { label: "Concluído", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  no_show: { label: "Não compareceu", variant: "destructive" },
};

export default function ClientLayout() {
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
        .select('id, name, slug')
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
          company:companies(name, slug)
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
    // Only pending or confirmed can be modified
    if (booking.booking_status !== 'pending' && booking.booking_status !== 'confirmed') {
      return false;
    }
    
    // Check if booking time has passed or is within 30 minutes
    const now = new Date();
    const [year, month, day] = booking.booking_date.split('-').map(Number);
    const [hours, minutes] = booking.start_time.split(':').map(Number);
    const bookingDateTime = new Date(year, month - 1, day, hours, minutes);
    
    // Must be at least 30 minutes before the appointment
    const minAdvanceMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    const timeUntilBooking = bookingDateTime.getTime() - now.getTime();
    
    return timeUntilBooking >= minAdvanceMs;
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-hero">
        <ClientSidebar
          clientId={client?.id || "N/A"}
          currentUser={null}
          companySlug={company?.slug || ""}
          companyName={company?.name || ""}
          companyId={company?.id || ""}
        />

        <main className="flex-1 flex flex-col">
          <header className="h-20 flex items-center border-b border-primary/20 bg-card/30 backdrop-blur-md px-6 sticky top-0 z-10">
            <SidebarTrigger className="text-foreground hover:bg-primary/10 mr-4" />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-gradient">Meus Agendamentos</h1>
              <p className="text-xs text-muted-foreground">Histórico e gerenciamento</p>
            </div>
          </header>

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
                            
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-2 gap-x-6">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/40 px-3 py-1 rounded-lg">
                                <Calendar className="h-4 w-4 text-primary" />
                                <span className="font-medium text-foreground">{booking.booking_date}</span>
                                <span className="text-xs">às</span>
                                <span className="font-bold text-primary">{booking.start_time.slice(0, 5)}</span>
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

                        <div className="flex lg:flex-col justify-end gap-2 shrink-0">
                          {canModifyBooking(booking) ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRescheduleBooking(booking)}
                                className="flex-1 lg:flex-none h-10 border-primary/20 hover:bg-primary/10 hover:border-primary/40"
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reagendar
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setCancelBooking(booking)}
                                className="flex-1 lg:flex-none h-10 bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <div className="text-xs text-muted-foreground text-right italic lg:mt-auto">
                              Agendamento finalizado ou fora do prazo de alteração
                            </div>
                          )}
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