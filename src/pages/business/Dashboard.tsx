import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { 
  Calendar, 
  Users, 
  DollarSign, 
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export default function BusinessDashboard() {
  const { slug } = useParams();
  const [company, setCompany] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [stats, setStats] = useState({
    todayBookings: 0,
    weekBookings: 0,
    monthRevenue: 0,
    totalClients: 0,
    pendingBookings: 0,
    confirmedBookings: 0,
    completedBookings: 0
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDashboardData();
  }, [slug]);

  const fetchDashboardData = async () => {
    try {
      // Buscar dados da empresa
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .single();

      if (companyError) {
        toast({
          title: "Erro",
          description: "Empresa não encontrada.",
          variant: "destructive",
        });
        return;
      }

      setCompany(companyData);

      // Buscar dados do funcionário atual
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setCurrentUser(user);
        const { data: employeeData } = await supabase
          .from('employees')
          .select('*')
          .eq('company_id', companyData.id)
          .eq('user_id', user.id)
          .single();

        setEmployee(employeeData);

        // Buscar estatísticas
        await fetchStats(companyData.id);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (companyId: string) => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Agendamentos de hoje
      const { count: todayCount } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('booking_date', new Date().toISOString().split('T')[0]);

      // Agendamentos da semana
      const { count: weekCount } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('booking_date', startOfWeek.toISOString().split('T')[0]);

      // Total de clientes
      const { count: clientsCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

      // Agendamentos por status
      const { data: bookingsByStatus } = await supabase
        .from('bookings')
        .select('status')
        .eq('company_id', companyId)
        .gte('booking_date', startOfMonth.toISOString().split('T')[0]);

      const statusCounts = bookingsByStatus?.reduce((acc: any, booking: any) => {
        acc[booking.status] = (acc[booking.status] || 0) + 1;
        return acc;
      }, {}) || {};

      // Receita do mês (simplificado - usando preço do serviço)
      const { data: monthlyBookings } = await supabase
        .from('bookings')
        .select('service:services(price)')
        .eq('company_id', companyId)
        .in('status', ['confirmed', 'completed'])
        .gte('booking_date', startOfMonth.toISOString().split('T')[0]);

      const totalRevenue = monthlyBookings?.reduce((sum, booking: any) => sum + Number(booking.service?.price || 0), 0) || 0;

      setStats({
        todayBookings: todayCount || 0,
        weekBookings: weekCount || 0,
        monthRevenue: totalRevenue,
        totalClients: clientsCount || 0,
        pendingBookings: statusCounts.pending || 0,
        confirmedBookings: statusCounts.confirmed || 0,
        completedBookings: statusCounts.completed || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!company || !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gradient mb-4">Acesso Negado</h2>
          <p className="text-muted-foreground">Você não tem permissão para acessar este painel.</p>
        </div>
      </div>
    );
  }

  return (
    <BusinessLayout 
      companySlug={company.slug} 
      companyName={company.name}
      companyId={company.id}
      userRole={employee.role}
      currentUser={currentUser}
    >
      <div className="p-6 space-y-8">
        {/* Welcome Header */}
        <div>
          <h1 className="text-3xl font-bold text-gradient mb-2">
            Bem-vindo, {employee.name}!
          </h1>
          <p className="text-muted-foreground">
            Aqui está um resumo do seu estabelecimento hoje.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Agendamentos Hoje</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gradient">{stats.todayBookings}</div>
              <p className="text-xs text-muted-foreground">
                agenda do dia
              </p>
            </CardContent>
          </Card>

          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Agendamentos Semana</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gradient">{stats.weekBookings}</div>
              <p className="text-xs text-muted-foreground">
                últimos 7 dias
              </p>
            </CardContent>
          </Card>

          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita do Mês</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gradient">
                R$ {stats.monthRevenue.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                faturamento mensal
              </p>
            </CardContent>
          </Card>

          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gradient">{stats.totalClients}</div>
              <p className="text-xs text-muted-foreground">
                clientes cadastrados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status dos Agendamentos */}
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl text-gradient">Status dos Agendamentos</CardTitle>
              <CardDescription>Visão geral do status atual</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                    <span>Pendentes</span>
                  </div>
                  <span className="font-semibold text-yellow-500">{stats.pendingBookings}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>Confirmados</span>
                  </div>
                  <span className="font-semibold text-green-500">{stats.confirmedBookings}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-500" />
                    <span>Completados</span>
                  </div>
                  <span className="font-semibold text-blue-500">{stats.completedBookings}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ações Rápidas */}
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl text-gradient">Ações Rápidas</CardTitle>
              <CardDescription>Acesse rapidamente as funções principais</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <a 
                  href={`/${company.slug}/admin/agendamentos`}
                  className="flex flex-col items-center gap-2 p-4 bg-background/50 rounded-lg hover:bg-primary/10 transition-colors"
                >
                  <Calendar className="w-8 h-8 text-primary" />
                  <span className="text-sm font-medium">Ver Agenda</span>
                </a>
                
                <a 
                  href={`/${company.slug}/admin/servicos`}
                  className="flex flex-col items-center gap-2 p-4 bg-background/50 rounded-lg hover:bg-primary/10 transition-colors"
                >
                  <Clock className="w-8 h-8 text-primary" />
                  <span className="text-sm font-medium">Gerenciar Serviços</span>
                </a>
                
                <a 
                  href={`/${company.slug}/admin/colaboradores`}
                  className="flex flex-col items-center gap-2 p-4 bg-background/50 rounded-lg hover:bg-primary/10 transition-colors"
                >
                  <Users className="w-8 h-8 text-primary" />
                  <span className="text-sm font-medium">Colaboradores</span>
                </a>
                
                <a 
                  href={`/${company.slug}/admin/configuracoes`}
                  className="flex flex-col items-center gap-2 p-4 bg-background/50 rounded-lg hover:bg-primary/10 transition-colors"
                >
                  <TrendingUp className="w-8 h-8 text-primary" />
                  <span className="text-sm font-medium">Configurações</span>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BusinessLayout>
  );
}