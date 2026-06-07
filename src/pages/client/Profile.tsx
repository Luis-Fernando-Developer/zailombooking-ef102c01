import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { formatCPF, cleanCPF, validateCPF } from "@/lib/cpfValidation";
import { User, Mail, Phone, MapPin, CreditCard, Shield, Trash2, Save, Camera } from "lucide-react";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface ClientData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  company_id: string;
  user_id: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export default function ClientProfile() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    accepts_marketing: true
  });

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
        toast({
          title: "Acesso negado",
          description: "Perfil de cliente não encontrado.",
          variant: "destructive"
        });
        navigate(`/${slug}/entrar`);
        return;
      }

      setClient(clientData);
      setFormData({
        name: clientData.name || "",
        email: clientData.email || "",
        phone: clientData.phone || "",
        cpf: clientData.cpf ? formatCPF(clientData.cpf) : "",
        address: "",
        city: "",
        state: "",
        zip_code: "",
        accepts_marketing: true
      });
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'cpf') {
      setFormData(prev => ({ ...prev, cpf: formatCPF(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async () => {
    if (!client) return;
    setIsSaving(true);

    try {
      // Validate CPF if provided
      const cleanedCpf = cleanCPF(formData.cpf);
      if (cleanedCpf && !validateCPF(cleanedCpf)) {
        toast({
          title: "CPF inválido",
          description: "Por favor, insira um CPF válido.",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('clients')
        .update({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
          cpf: cleanedCpf || null
        })
        .eq('id', client.id);

      if (error) throw error;

      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram salvas com sucesso."
      });

      // Refresh client data
      fetchData();
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteData = async () => {
    if (!client) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          phone: null,
          cpf: null,
          is_active: false
        })
        .eq('id', client.id);

      if (error) throw error;

      toast({
        title: "Solicitação registrada",
        description: "Seus dados pessoais foram marcados para exclusão. Você não receberá mais comunicações de marketing."
      });

      setShowDeleteDialog(false);
      
      // Sign out and redirect
      await supabase.auth.signOut();
      navigate(`/${slug}`);
    } catch (error) {
      console.error("Error deleting data:", error);
      toast({
        title: "Erro",
        description: "Não foi possível processar a solicitação.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
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
          <header className="h-20 flex items-center border-b border-primary/20 bg-card/30 backdrop-blur-md px-6 sticky top-0 z-10">
            <SidebarTrigger className="text-foreground hover:bg-primary/10 mr-4" />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-gradient">Meu Perfil</h1>
              <p className="text-xs text-muted-foreground">Gerencie seus dados e privacidade</p>
            </div>
          </header>

          {/* Content */}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
            
            {/* Profile Header Card */}
            <div className="relative overflow-hidden rounded-3xl bg-card/40 border border-primary/20 p-8 card-glow">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl"></div>
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-primary rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
                  <Avatar className="w-24 h-24 border-2 border-primary/20 relative">
                    <AvatarFallback className="bg-gradient-primary text-3xl font-black text-white">
                      {client?.name?.charAt(0)?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <button className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full shadow-neon hover:scale-110 transition-transform">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-center md:text-left space-y-1">
                  <h2 className="text-3xl font-extrabold tracking-tight">{client?.name}</h2>
                  <p className="text-muted-foreground flex items-center justify-center md:justify-start gap-2">
                    <Mail className="w-4 h-4" /> {client?.email}
                  </p>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-4">
                    <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary-glow">Cliente VIP</Badge>
                    <Badge variant="outline" className="bg-green-500/5 border-green-500/20 text-green-500">Conta Verificada</Badge>
                  </div>
                </div>
                <div className="md:ml-auto flex gap-3">
                  <Button 
                    variant="neon" 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="shadow-neon px-8"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Alterações
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Left Column - Navigation/Info */}
              <div className="space-y-6">
                <div className="bg-card/40 border border-primary/10 rounded-2xl p-6 space-y-4">
                  <h3 className="font-bold text-lg border-b border-primary/10 pb-2">Resumo</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cliente desde</span>
                      <span className="font-medium">{new Date(client?.created_at || "").toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ID da Conta</span>
                      <span className="font-medium text-[10px] bg-muted/20 px-2 py-0.5 rounded uppercase tracking-tighter">#{client?.id?.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-6 space-y-4">
                  <h3 className="font-bold text-lg text-destructive flex items-center gap-2">
                    <Shield className="w-5 h-5" /> Zona de Perigo
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Ao excluir seus dados, você perderá acesso ao seu histórico de agendamentos.
                  </p>
                  <Button 
                    variant="destructive" 
                    className="w-full bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir Meus Dados
                  </Button>
                </div>
              </div>

              {/* Main Column - Forms */}
              <div className="md:col-span-2 space-y-8">
                {/* Personal Info */}
                <Card className="bg-card/40 backdrop-blur-sm border-primary/10 overflow-hidden">
                  <CardHeader className="bg-primary/5 border-b border-primary/10">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="w-5 h-5 text-primary" /> Informações Pessoais
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome completo</Label>
                        <Input
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          className="bg-background/30 border-primary/10 focus:border-primary/40 h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</Label>
                        <Input
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          className="bg-background/30 border-primary/10 focus:border-primary/40 h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Telefone</Label>
                        <Input
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="(11) 99999-9999"
                          className="bg-background/30 border-primary/10 focus:border-primary/40 h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cpf" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">CPF</Label>
                        <Input
                          id="cpf"
                          name="cpf"
                          value={formData.cpf}
                          onChange={handleInputChange}
                          maxLength={14}
                          className="bg-background/30 border-primary/10 focus:border-primary/40 h-12"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Address */}
                <Card className="bg-card/40 backdrop-blur-sm border-primary/10 overflow-hidden">
                  <CardHeader className="bg-primary/5 border-b border-primary/10">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary" /> Endereço
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="address" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Logradouro</Label>
                      <Input
                        id="address"
                        name="address"
                        value={formData.address}
                        onChange={handleInputChange}
                        placeholder="Rua, número, complemento"
                        className="bg-background/30 border-primary/10 focus:border-primary/40 h-12"
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="city" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cidade</Label>
                        <Input id="city" name="city" value={formData.city} onChange={handleInputChange} className="bg-background/30 border-primary/10 h-12" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Estado</Label>
                        <Input id="state" name="state" value={formData.state} onChange={handleInputChange} maxLength={2} className="bg-background/30 border-primary/10 h-12" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zip_code" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">CEP</Label>
                        <Input id="zip_code" name="zip_code" value={formData.zip_code} onChange={handleInputChange} className="bg-background/30 border-primary/10 h-12" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Privacy */}
                <Card className="bg-card/40 backdrop-blur-sm border-primary/10 overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-bold">Comunicações de Marketing</h4>
                        <p className="text-sm text-muted-foreground">Receba ofertas exclusivas e lembretes por email.</p>
                      </div>
                      <Switch
                        checked={formData.accepts_marketing}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, accepts_marketing: checked }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

              {/* Privacy & LGPD */}
              <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Privacidade e LGPD
                  </CardTitle>
                  <CardDescription>Gerencie suas preferências de privacidade</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Receber ofertas e promoções</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba novidades, ofertas exclusivas e promoções por email
                      </p>
                    </div>
                    <Switch
                      checked={formData.accepts_marketing}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, accepts_marketing: checked }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium text-destructive">Exclusão de dados</h4>
                      <p className="text-sm text-muted-foreground">
                        Conforme a Lei Geral de Proteção de Dados (LGPD), você pode solicitar 
                        a exclusão dos seus dados pessoais a qualquer momento.
                      </p>
                    </div>

                    <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                      <DialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Solicitar exclusão dos meus dados
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-primary/20">
                        <DialogHeader>
                          <DialogTitle className="text-destructive">Confirmar exclusão de dados</DialogTitle>
                          <DialogDescription>
                            Esta ação irá:
                          </DialogDescription>
                        </DialogHeader>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground my-4">
                          <li>Remover seus dados pessoais (telefone, CPF, endereço)</li>
                          <li>Cancelar o recebimento de comunicações de marketing</li>
                          <li>Manter apenas dados essenciais para histórico de transações</li>
                          <li>Encerrar sua sessão atual</li>
                        </ul>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            onClick={() => setShowDeleteDialog(false)}
                            className="flex-1"
                          >
                            Cancelar
                          </Button>
                          <Button 
                            variant="destructive" 
                            onClick={handleDeleteData}
                            disabled={isDeleting}
                            className="flex-1"
                          >
                            {isDeleting ? "Processando..." : "Confirmar exclusão"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <Button 
                variant="neon" 
                size="lg" 
                onClick={handleSave} 
                disabled={isSaving}
                className="w-full"
              >
                {isSaving ? "Salvando..." : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar alterações
                  </>
                )}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
