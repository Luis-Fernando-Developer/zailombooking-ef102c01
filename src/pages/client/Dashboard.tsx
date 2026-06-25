import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { ClientNotificationsBell } from "@/components/client/ClientNotificationsBell";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, MoreVertical } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface BookingStats {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}

export default function ClientDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [client, setClient] = useState<any>(null);
  const [stats, setStats] = useState<BookingStats>({
    total: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0
  });
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      // Get company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name, slug, logo_url')
        .eq('slug', slug)
        .single();

      if (companyError || !companyData) {
        navigate('/404');
        return;
      }
      setCompany(companyData);

      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        navigate(`/${slug}/entrar`);
        return;
      }

      // Get client profile
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('company_id', companyData.id)
        .single();

      if (clientError || !clientData) {
        navigate(`/${slug}/entrar`);
        return;
      }
      setClient(clientData);

      // Get bookings stats
      const { data: bookings } = await supabase
        .from('bookings')
        .select('booking_status, booking_date, start_time, service:services(name), employee:employees(name)')
        .eq('client_id', clientData.id);

      if (bookings) {
        const newStats: BookingStats = {
          total: bookings.length,
          pending: bookings.filter(b => b.booking_status === 'pending').length,
          confirmed: bookings.filter(b => b.booking_status === 'confirmed').length,
          completed: bookings.filter(b => b.booking_status === 'completed').length,
          cancelled: bookings.filter(b => b.booking_status === 'cancelled').length
        };
        setStats(newStats);

        // Get upcoming bookings (confirmed or pending, future dates)
        const today = new Date().toISOString().split('T')[0];
        const upcoming = bookings
          .filter(b => 
            (b.booking_status === 'pending' || b.booking_status === 'confirmed') &&
            b.booking_date >= today
          )
          .sort((a, b) => {
            const dateCompare = (a.booking_date || '').localeCompare(b.booking_date || '');
            if (dateCompare !== 0) return dateCompare;
            return (a.start_time || '').localeCompare(b.start_time || '');
          })
          .slice(0, 5);
        setUpcomingBookings(upcoming);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatLongDate = (date: string, time: string) => {
    if (!date) return "";
    const [y, m, d] = date.split('-').map(Number);
    const t = (time || '').split(':');
    const dt = new Date(y, m - 1, d, Number(t[0] || 0), Number(t[1] || 0));
    const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const dd = String(d).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mi = String(dt.getMinutes()).padStart(2, '0');
    return `${dd} de ${months[m - 1]} de ${y} às ${hh}:${mi}`;
  };

  const formatTime = (time: string) => {
    if (!time) return "--:--";
    // Check if it's an ISO string (contains T) or just HH:mm:ss
    if (time.includes('T')) {
      const timePart = time.split('T')[1];
      return timePart.substring(0, 5);
    }
    return time.substring(0, 5);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex flex-col h-screen w-full bg-gradient-hero overflow-hidden">
        {/* Header - Agora ocupa toda a largura no topo */}
        <header className="h-20 flex items-center border-b border-primary/20 bg-card/30 backdrop-blur-md px-6 z-20 shrink-0 w-full">
          <SidebarTrigger className="text-foreground hover:bg-primary/10 mr-4" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-gradient">
              Painel do Cliente
            </h1>
            <p className="text-xs text-muted-foreground">Gerencie seus agendamentos na {company?.name}</p>
          </div>
          <div className="ml-auto">
            <ClientNotificationsBell companyId={company?.id} />
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <ClientSidebar
            clientId={client?.id || ""}
            currentUser={null}
            companySlug={company?.slug || ""}
            companyName={company?.name || ""}
            companyId={company?.id || ""}
          />

          <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">



          {/* Content */}
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-10">
            
            {/* Hero Section */}
            <section className="relative overflow-hidden rounded-3xl bg-card/40 border border-primary/20 p-8 md:p-12 card-glow group">
              <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-primary/20 rounded-full blur-[100px] group-hover:bg-primary/30 transition-colors duration-500"></div>
              <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-neon-pink/10 rounded-full blur-[100px]"></div>
              
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-4">
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary-glow animate-pulse">
                    <span className="relative flex h-2 w-2 mr-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                    Painel Ativo
                  </div>
                  <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                    Olá, <span className="text-neon">{client?.name?.split(' ')[0] || "Visitante"}</span>! 👋
                  </h2>
                  <p className="text-lg text-muted-foreground max-w-md">
                    É bom ter você de volta. Que tal cuidar de você hoje e agendar um novo serviço?
                  </p>
                  <button 
                    onClick={() => navigate(`/${slug}/agendar`)}
                    className="mt-4 px-6 py-3 bg-gradient-primary text-white rounded-xl font-bold shadow-neon hover:shadow-neon-strong transition-all duration-300 transform hover:-translate-y-1 active:scale-95 flex items-center gap-2 group/btn w-fit"
                  >
                    <Calendar className="w-5 h-5 group-hover/btn:rotate-12 transition-transform" />
                    Novo Agendamento
                  </button>
                </div>
                
                <div className="hidden lg:block">
                  <div className="w-40 h-40 rounded-full bg-gradient-primary p-1 animate-float">
                    <div className="w-full h-full rounded-full bg-card flex items-center justify-center text-4xl font-bold text-gradient">
                      {client?.name?.charAt(0) || "U"}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Stats Cards */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: "Total", value: stats.total, icon: Calendar, color: "primary" },
                { label: "Agendados", value: stats.pending + stats.confirmed, icon: Clock, color: "yellow-500" },
                { label: "Concluídos", value: stats.completed, icon: CheckCircle, color: "green-500" },
                { label: "Cancelados", value: stats.cancelled, icon: XCircle, color: "red-500" }
              ].map((stat, i) => (
                <div key={i} className="group relative">
                  <div className={`absolute -inset-0.5 bg-${stat.color} rounded-2xl blur opacity-0 group-hover:opacity-20 transition duration-500`}></div>
                  <Card className="relative bg-card/50 backdrop-blur-sm border-primary/10 overflow-hidden hover:border-primary/30 transition-all duration-300">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className={`p-3 bg-${stat.color}/10 rounded-2xl group-hover:scale-110 transition-transform duration-300`}>
                          <stat.icon className={`w-6 h-6 text-${stat.color}`} />
                        </div>
                        <div>
                          <p className="text-3xl font-black tracking-tighter">{stat.value}</p>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </section>

            {/* Upcoming Bookings */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gradient">Próximos Agendamentos</h3>
                <button 
                  onClick={() => navigate(`/${slug}/agendamentos`)}
                  className="text-sm font-medium text-primary hover:text-primary-glow transition-colors"
                >
                  Ver todos
                </button>
              </div>
              
              <Card className="bg-card/40 backdrop-blur-md border-primary/10 overflow-hidden">
                <CardContent className="p-6">
                  {upcomingBookings.length === 0 ? (
                    <div className="text-center py-12 space-y-4">
                      <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground font-medium">Você não tem agendamentos próximos.</p>
                      <Button variant="outline" onClick={() => navigate(`/${slug}/agendar`)}>Fazer um agendamento agora</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {upcomingBookings.map((booking, index) => (
                        <div 
                          key={index}
                          className="group flex flex-col md:flex-row md:items-center justify-between p-5 bg-background/20 rounded-2xl border border-primary/5 hover:border-primary/20 transition-all duration-300 hover:translate-x-1"
                        >
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-neon-pink/20 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:rotate-3 transition-transform">
                              <Calendar className="w-6 h-6 text-primary" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-bold text-lg group-hover:text-primary transition-colors">{booking.service?.name}</h4>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  <Clock className="w-4 h-4" />
                                  {formatDate(booking.booking_date)}
                                </span>
                                <span className="flex items-center gap-1.5 font-bold text-foreground">
                                  às {formatTime(booking.start_time)}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-4 md:mt-0 flex items-center justify-between md:justify-end gap-4">
                            <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                              booking.booking_status === 'confirmed' 
                                ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                                : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                            }`}>
                              {booking.booking_status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                            </div>
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-2 hover:bg-primary/10 rounded-full transition-colors flex flex-col gap-0.5 outline-none">
                                  <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                  <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                  <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 bg-card/95 backdrop-blur-md border-primary/20">
                                <DropdownMenuItem 
                                  className="cursor-pointer focus:bg-primary/10 flex items-center gap-2"
                                  onClick={() => navigate(`/${slug}/agendamentos`)}
                                >
                                  <RefreshCw className="w-4 h-4 text-primary" />
                                  <span>Reagendar / Detalhes</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="cursor-pointer focus:bg-destructive/10 text-destructive focus:text-destructive flex items-center gap-2"
                                  onClick={() => navigate(`/${slug}/agendamentos`)}
                                >
                                  <XCircle className="w-4 h-4" />
                                  <span>Cancelar</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
