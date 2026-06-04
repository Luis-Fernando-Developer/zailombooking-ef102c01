import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { AddBookingDialog } from "@/components/business/AddBookingDialog";
import { 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Mail,
  Filter,
  Plus,
  Edit,
  Check,
  X,
  AlertCircle,
  MoreVertical,
  CalendarClock
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { RescheduleBookingDialog } from "@/components/business/RescheduleBookingDialog";


const statusConfig = {
  pending: { label: "Pendente", color: "bg-yellow-500", variant: "secondary" as const },
  confirmed: { label: "Confirmado", color: "bg-green-500", variant: "default" as const },
  cancelled: { label: "Cancelado", color: "bg-red-500", variant: "destructive" as const },
  completed: { label: "Concluído", color: "bg-blue-500", variant: "default" as const },
  no_show: { label: "Não compareceu", color: "bg-gray-500", variant: "secondary" as const }
};

const paymentConfig = {
  pending: { label: "Pendente", color: "bg-yellow-500" },
  confirmed: { label: "Pago", color: "bg-green-500" },
  cancelled: { label: "Cancelado", color: "bg-red-500" },
  free: { label: "Isento", color: "bg-blue-500" }
};

interface Company {
  id: string;
  name: string;
  slug: string;
}

export default function BusinessBookings() {
  const { slug } = useParams();
  const [company, setCompany] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "",
    payment: "",
    date: "",
    search: ""
  });
  const [rescheduleBooking, setRescheduleBooking] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
    console.log('Slug:', slug);
  }, [slug]);

  useEffect(() => {
    applyFilters();
  }, [bookings, filters]);

  async function fetchData() {
    console.log('fetchData chamado');
    try {
      // Buscar dados da empresa
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (companyError) {
        console.error('Error fetching company:', companyError);
        toast({
          title: "Erro",
          description: "Não foi possível carregar os dados da empresa.",
          variant: "destructive",
        });
        return;
      }

      if (!companyData) {
        console.error('Company not found for slug:', slug);
        toast({
          title: "Empresa não encontrada",
          description: "A empresa especificada não foi encontrada.",
          variant: "destructive",
        });
        return;
      }

      setCompany(companyData);

      // Buscar dados do funcionário
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('Error fetching user:', userError);
        toast({
          title: "Erro de autenticação",
          description: "Não foi possível verificar o usuário logado.",
          variant: "destructive",
        });
        return;
      }

      if (user) {
        setCurrentUser(user);
        
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('*, company:companies(*)')
          .eq('user_id', user.id)
          .maybeSingle();

        if (employeeError) {
          console.error('Error fetching employee:', employeeError);
          toast({
            title: "Erro",
            description: "Não foi possível verificar suas permissões.",
            variant: "destructive",
          });
          return;
        }

        setEmployee(employeeData);

        // Buscar agendamentos se tiver permissão
        if (employeeData && employeeData.company_id === companyData.id) {
          await fetchBookings(companyData.id);
          
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBookings = async (companyId: string) => {
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select(`
        *,
        client:clients(*),
        service:services(*),
        combo:service_combos(*),
        employee:employees(*)
      `)
      .eq('company_id', companyId)
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: true });

    console.log('bookingsData:', bookingsData);
    setBookings(bookingsData || []);
  };

  const applyFilters = () => {
    let filtered = [...bookings];

    if (filters.status) {
      filtered = filtered.filter(booking => booking.status === filters.status);
    }

    if (filters.payment) {
      filtered = filtered.filter(booking => booking.payment_status === filters.payment);
    }

    if (filters.date) {
      filtered = filtered.filter(booking => booking.booking_date === filters.date);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(booking => 
        booking.client?.name?.toLowerCase().includes(searchLower) ||
        booking.service?.name?.toLowerCase().includes(searchLower) ||
        booking.combo?.name?.toLowerCase().includes(searchLower) ||
        booking.employee?.name?.toLowerCase().includes(searchLower)
      );
    }
    console.log('filteredBookings:', filtered);
    setFilteredBookings(filtered);
  };

  const updateBookingStatus = async (bookingId: string, status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show') => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: status })
        .eq('id', bookingId);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: "O status do agendamento foi atualizado com sucesso.",
      });

      // Atualizar lista
      await fetchBookings(company.id);
    } catch (error) {
      console.error('Error updating booking:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status do agendamento.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (date: string) => {
    // Criar data tratando a string como local, não UTC, para evitar problemas de timezone
    const [year, month, day] = date.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    
    return localDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando agendamentos...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gradient mb-4">Empresa não encontrada</h2>
          <p className="text-muted-foreground">A empresa especificada não foi encontrada ou não existe.</p>
        </div>
      </div>
    );
  }

  if (!employee || employee.company_id !== company.id) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gradient mb-4">Acesso Negado</h2>
          <p className="text-muted-foreground">Você não tem permissão para acessar os agendamentos desta empresa.</p>
          <p className="text-sm text-muted-foreground mt-2">Faça login com uma conta autorizada.</p>
        </div>
      </div>
    );
  }

  // Verificar se pode gerenciar agendamentos
  const canManageBookings = ['owner', 'admin', 'manager', 'receptionist'].includes(employee?.role || '');

  return (
    <BusinessLayout 
      companySlug={company.slug} 
      companyName={company.name}
      companyId={company.id}
      userRole={employee.role}
      currentUser={currentUser}
    >
      <div className="p-4 space-y-6 justify-center flex flex-col items-center w-full px-10 ">
        {/* Header */}
        <div className="flex flex-col space-y-2 justify-between lg:flex-row lg:items-center w-full">
          <div className="flex flex-col mb-1  w-full">
            <h1 className="text-3xl font-bold text-gradient mb-1">Agendamentos</h1>
            <p className="text-muted-foreground">
              Gerencie todos os agendamentos do estabelecimento
            </p>
          </div>
          {canManageBookings && (
            <AddBookingDialog
              companyId={company.id}
              companySlug={company.slug}
              onBookingAdded={() => fetchBookings(company.id)}
            />
          )}
        </div>

        {/* Filters */}
        <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20 w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full flex flex-col sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Input
                placeholder="Buscar cliente, serviço..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="bg-background/50 w-full"
              />
              
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger className="w-full flex bg-background/50">
                  <SelectValue placeholder="Status do agendamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="no_show">Não compareceu</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.payment} onValueChange={(value) => setFilters(prev => ({ ...prev, payment: value }))}>
                <SelectTrigger className="w-full bg-background/50">
                  <SelectValue placeholder="Status do pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os pagamentos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Pago</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                  <SelectItem value="free">Isento</SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="text"
                value={filters.date}
                onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
                onTouchStart={(e) => (e.currentTarget.type = 'date')}
                onMouseDown={(e) => (e.currentTarget.type = 'date')}
                onFocus={(e) => (e.currentTarget.type = 'date')}
                onBlur={(e) => (e.currentTarget.type = 'text')}
                className=" flex w-full focus:w-full sm:min-w-40 bg-background/50 "
                placeholder="Filtrar por data"
              />

              <Button 
                variant="outline" 
                onClick={() => setFilters({ status: "", payment: "", date: "", search: "" })}
              >
                Limpar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bookings List */}
        <div className="flex flex-col lg:grid lg:grid-cols-3 w-full  justify-center gap-6 ">
          {filteredBookings.length === 0 ? (
            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
              <CardContent className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum agendamento encontrado</h3>
                <p className="text-muted-foreground">
                  Não há agendamentos que correspondam aos filtros selecionados.
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredBookings.map((booking) => (
              <Card key={booking.id} className="flex flex-col card-glow bg-card/50 backdrop-blur-sm border-primary/20 ">
                <CardContent className="relative w-full p-6 flex flex-col  h-full">
                  <div className="w-full flex flex-col">
                    <div className="flex flex-col space-y-4">
                      {/* Status Badges */}
                      <div className="flex w-full gap-2">
                        <Badge variant={statusConfig[booking.booking_status as keyof typeof statusConfig].variant}>
                          <div className={`w-2 h-2 rounded-full ${statusConfig[booking.booking_status as keyof typeof statusConfig].color} mr-1`}></div>
                          {statusConfig[booking.booking_status as keyof typeof statusConfig].label}
                        </Badge>
                        <Badge variant="outline">
                          <div className={`w-2 h-2 rounded-full ${paymentConfig[booking.payment_status as keyof typeof paymentConfig].color} mr-1`}></div>
                          {paymentConfig[booking.payment_status as keyof typeof paymentConfig].label}
                        </Badge>
                      </div>

                      {/* Service & Price */}
                      <div className=" w-full flex flex-col ">
                        <h3 className=" text-muted-foreground">
                          {booking.combo_id ? "Combo" : "Serviço"}
                        </h3>
                        <div className="flex gap-3 items-center">
                          <p className="font-medium ">
                            {booking.combo_id ? booking.combo?.name : booking.service?.name}
                          </p>
                          <p className=" font-medium text-primary">R$ {booking.price}</p>
                        </div>
                      </div>

                      {/* Professional */}
                      <div>
                        <p className="text-sm text-muted-foreground">Profissional</p>
                        <p className="font-medium">{booking.employee?.name || "Não definido"}</p>
                      </div>

                      {/* Date & Time */}
                      <div className=" w-full flex flex-col">
                        <p className="text-sm text-muted-foreground">Data e Horário</p>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">{formatDate(booking.booking_date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span className="font-medium">{formatTime(booking.booking_time)}</span>
                        </div>
                      </div>

                      {/* Client Info */}
                      <div className=" w-full flex justify-between flex-col py-2 border-t border-primary/40 bg-slate-700/5 rounded-lg mt-8 ">
                        <div className="flex flex-col items-center gap-2 mb-2 ">
                          <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-white" />
                          </div>
                          <span className="font-medium">{booking.client?.name}</span>
                        </div>
                        <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {booking.client?.phone}
                          </div>
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {booking.client?.email}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="absolute top-5 right-3">
                      <DropdownMenu >
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-primary/20">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => updateBookingStatus(booking.id, 'confirmed')}>
                            <Check className="mr-2 h-4 w-4" />
                            Confirmar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateBookingStatus(booking.id, 'completed')}>
                            <Check className="mr-2 h-4 w-4" />
                            Marcar como Concluído
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateBookingStatus(booking.id, 'no_show')}>
                            <AlertCircle className="mr-2 h-4 w-4" />
                            Não Realizado
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateBookingStatus(booking.id, 'cancelled')}>
                            <X className="mr-2 h-4 w-4" />
                            Cancelar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setRescheduleBooking(booking)}>
                            <CalendarClock className="mr-2 h-4 w-4" />
                            Reagendar
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {booking.notes && (
                    <div className="mt-4 p-3 bg-background/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        <strong>Observações:</strong> {booking.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Reschedule Dialog */}
      <RescheduleBookingDialog
        open={!!rescheduleBooking}
        onOpenChange={(open) => !open && setRescheduleBooking(null)}
        booking={rescheduleBooking}
        companyId={company?.id}
        onSuccess={() => fetchBookings(company.id)}
      />
    </BusinessLayout>
  );
}