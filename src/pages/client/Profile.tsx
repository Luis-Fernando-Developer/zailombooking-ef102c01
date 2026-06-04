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
          {/* Header */}
          <header className="h-fit flex items-center border-b border-primary/20 bg-card/30 backdrop-blur-sm px-4">
            <SidebarTrigger className="text-foreground hover:bg-primary/10" />
            <div className="ml-4 flex flex-col py-3">
              <h1 className="text-lg font-semibold text-gradient">Meu Perfil</h1>
            </div>
          </header>

          {/* Content */}
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
            <div className="space-y-6">
              {/* Avatar Section */}
              <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-20 h-20">
                      <AvatarFallback className="bg-gradient-primary text-2xl text-white">
                        {client?.name?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-xl font-semibold">{client?.name}</h2>
                      <p className="text-sm text-muted-foreground">{client?.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Personal Info */}
              <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Informações Pessoais
                  </CardTitle>
                  <CardDescription>Atualize seus dados pessoais</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome completo</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="bg-background/50"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          className="pl-10 bg-background/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="(11) 99999-9999"
                          className="pl-10 bg-background/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cpf">CPF</Label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="cpf"
                          name="cpf"
                          value={formData.cpf}
                          onChange={handleInputChange}
                          placeholder="000.000.000-00"
                          maxLength={14}
                          className="pl-10 bg-background/50"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Address */}
              <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Endereço
                  </CardTitle>
                  <CardDescription>Seu endereço para contato</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço</Label>
                    <Input
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="Rua, número, complemento"
                      className="bg-background/50"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        className="bg-background/50"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state">Estado</Label>
                      <Input
                        id="state"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        maxLength={2}
                        placeholder="SP"
                        className="bg-background/50"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="zip_code">CEP</Label>
                      <Input
                        id="zip_code"
                        name="zip_code"
                        value={formData.zip_code}
                        onChange={handleInputChange}
                        placeholder="00000-000"
                        className="bg-background/50"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

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
