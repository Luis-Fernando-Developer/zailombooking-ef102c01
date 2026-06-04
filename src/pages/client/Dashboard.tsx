import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

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
        .select('id, name, slug')
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
        .select('status, booking_date, start_time, service:services(name)')
        .eq('client_id', clientData.id);

      if (bookings) {
        const newStats: BookingStats = {
          total: bookings.length,
          pending: bookings.filter(b => b.status === 'pending').length,
          confirmed: bookings.filter(b => b.status === 'confirmed').length,
          completed: bookings.filter(b => b.status === 'completed').length,
          cancelled: bookings.filter(b => b.status === 'cancelled').length
        };
        setStats(newStats);

        // Get upcoming bookings (confirmed or pending, future dates)
        const today = new Date().toISOString().split('T')[0];
        const upcoming = bookings
          .filter(b => 
            (b.status === 'pending' || b.status === 'confirmed') &&
            b.booking_date >= today
          )
          .sort((a, b) => {
            const dateCompare = a.booking_date.localeCompare(b.booking_date);
            if (dateCompare !== 0) return dateCompare;
            return a.start_time.localeCompare(b.start_time);
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

  const formatDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
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
      <div className="min-h-screen flex w-full bg-gradient-hero">
        <ClientSidebar
          clientId={client?.id || ""}
          currentUser={null}
          companySlug={company?.slug || ""}
          companyName={company?.name || ""}
          companyId={company?.id || ""}
        />

        <main className="flex-1 flex flex-col">
          {/* Header */}
          <header className="h-fit flex items-center border-b border-primary/20 bg-card/30 backdrop-blur-sm px-4">
            <SidebarTrigger className="text-foreground hover:bg-primary/10" />
            <div className="ml-4 flex flex-col py-3">
              <h1 className="text-lg font-semibold text-gradient">
                Olá, {client?.name?.split(' ')[0] || ""}!
              </h1>
              <p className="text-sm text-muted-foreground">Bem-vindo ao seu painel</p>
            </div>
          </header>

          {/* Content */}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/20 rounded-lg">
                        <Calendar className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.total}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-500/20 rounded-lg">
                        <Clock className="w-5 h-5 text-yellow-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.pending + stats.confirmed}</p>
                        <p className="text-xs text-muted-foreground">Agendados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/20 rounded-lg">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.completed}</p>
                        <p className="text-xs text-muted-foreground">Concluídos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-500/20 rounded-lg">
                        <XCircle className="w-5 h-5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.cancelled}</p>
                        <p className="text-xs text-muted-foreground">Cancelados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Upcoming Bookings */}
              <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="text-gradient">Próximos Agendamentos</CardTitle>
                  <CardDescription>Seus compromissos agendados</CardDescription>
                </CardHeader>
                <CardContent>
                  {upcomingBookings.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Nenhum agendamento próximo</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingBookings.map((booking, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-3 bg-background/30 rounded-lg border border-primary/10"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/20 rounded-lg">
                              <Calendar className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{booking.service?.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(booking.booking_date)} às {booking.booking_time?.slice(0, 5)}
                              </p>
                            </div>
                          </div>
                          <div className={`text-xs px-2 py-1 rounded-full ${
                            booking.booking_status === 'confirmed' 
                              ? 'bg-green-500/20 text-green-500' 
                              : 'bg-yellow-500/20 text-yellow-500'
                          }`}>
                            {booking.booking_status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
