import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyLogo } from "@/components/CompanyLogo";
import { User, Mail, Lock, Phone, ArrowLeft, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { PhoneInput } from "@/components/ui/phone-input";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { formatCPF, cleanCPF, validateCPF } from "@/lib/cpfValidation";

const signupSchema = z.object({
  firstName: z.string().trim().min(1, "Nome é obrigatório").max(50, "Nome deve ter no máximo 50 caracteres"),
  lastName: z.string().trim().min(1, "Sobrenome é obrigatório").max(50, "Sobrenome deve ter no máximo 50 caracteres"),
  email: z.string().trim().email("Email inválido").max(255, "Email deve ter no máximo 255 caracteres"),
  phone: z.string().trim().min(10, "Telefone deve ter no mínimo 10 dígitos").max(15, "Telefone deve ter no máximo 15 dígitos"),
  cpf: z.string().optional().refine((val) => !val || validateCPF(val), "CPF inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(100, "Senha deve ter no máximo 100 caracteres"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Senhas não coincidem",
  path: ["confirmPassword"]
});

export default function ClientSignup() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    cpf: "",
    password: "",
    confirmPassword: ""
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'cpf') {
      setFormData(prev => ({ ...prev, cpf: formatCPF(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      const dataToValidate = {
        ...formData,
        cpf: cleanCPF(formData.cpf),
      };

      const validatedData = signupSchema.parse(dataToValidate);

      // Buscar a empresa atual
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("id, name")
        .eq("slug", slug)
        .single();

      if (companyError || !companyData) {
        toast({
          title: "Erro",
          description: "Empresa não encontrada ou inativa.",
          variant: "destructive",
        });
        return;
      }

      const cleanedCpf = cleanCPF(validatedData.cpf || "");
      const fullName = `${validatedData.firstName} ${validatedData.lastName}`;

      const returnUrl =
        returnTo === "agendar"
          ? `/${slug}/agendar?restore=true`
          : `/${slug}/login`;

      const redirectTo = `${window.location.origin}${returnUrl}`;

      /*
       * Primeiro tentamos criar a conta Auth.
       *
       * Se o email já existir no Supabase Auth, o Supabase pode retornar
       * um usuário sem identities para evitar enumeração de usuários.
       */
      const { data: authData, error: authError } =
        await supabase.auth.signUp({
          email: validatedData.email,
          password: validatedData.password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              first_name: validatedData.firstName,
              last_name: validatedData.lastName,
              full_name: fullName,
              phone: validatedData.phone,
              company_id: companyData.id,
              role: "client",
            },
          },
        });

      if (authError) {
        toast({
          title: "Erro no cadastro",
          description: authError.message,
          variant: "destructive",
        });
        return;
      }

      const existingAuthUser =
        authData.user && authData.user.identities?.length === 0;

      if (existingAuthUser) {
        // O usuário já existe globalmente no Auth.
        // Em vez de forçar o login imediato com erro, solicitamos o ID do usuário
        // e enviamos o e-mail de confirmação de vínculo para esta empresa específica.
        
        // Buscamos o ID do usuário pelo email (precisa de permissão ou RPC se não logado)
        // Como o Supabase não retorna o ID em signUp para usuários existentes,
        // tentamos obter via RPC segura ou usamos o fluxo de "Solicitar Vínculo".
        
        const { data: userIdData, error: rpcError } = await supabase.rpc('get_user_id_by_email', { 
          _email: validatedData.email 
        });

        if (userIdData) {
          try {
            console.log("Usuário existente detectado. Solicitando vínculo para:", validatedData.email);
            
            const { data: funcData, error: funcError } = await supabase.functions.invoke("send-client-confirmation", {
              body: {
                user_id: userIdData,
                company_id: companyData.id,
                name: fullName,
                email: validatedData.email,
                phone: validatedData.phone,
                cpf: cleanedCpf || null,
                password: validatedData.password,
                redirectTo: redirectTo
              }
            });

            if (funcError) {
              console.error("Erro na Edge Function:", funcError);
              throw funcError;
            }
            
            console.log("Resposta da função de confirmação:", funcData);

            const msg = funcData?.whatsapp_sent 
              ? `Você já possui uma conta Zailom. Enviamos um link de confirmação para seu WhatsApp (${validatedData.phone}) para ativar seu acesso à empresa ${companyData.name}.`
              : `Você já possui uma conta Zailom. Um link de confirmação foi enviado para seu e-mail para validar seu acesso à empresa ${companyData.name}.`;

            toast({
              title: "Confirmação enviada",
              description: msg,
            });
            
            navigate(`/${slug}/entrar`);
            return;
          } catch (invokeError: any) {
            console.error("Erro ao invocar função de confirmação:", invokeError);
            toast({
              title: "Erro ao processar vínculo",
              description: "Não conseguimos enviar o link de confirmação. Tente novamente mais tarde.",
              variant: "destructive",
            });
            return;
          }
        } else {
          console.error("RPC get_user_id_by_email não retornou ID ou falhou:", rpcError);
          // Fallback para comportamento padrão se a RPC falhar
        }

        // Fallback para o comportamento anterior caso a RPC não esteja disponível
        const { data: loginData, error: loginError } =
          await supabase.auth.signInWithPassword({
            email: validatedData.email,
            password: validatedData.password,
          });

        if (loginError || !loginData.user) {
          toast({
            title: "Email já cadastrado",
            description:
              "Este email já possui uma conta. Use a senha da sua conta existente para se cadastrar nesta empresa.",
            variant: "destructive",
          });
          return;
        }

        /*
         * Agora temos o UUID real existente em auth.users.
         * Verificamos se esse usuário já possui vínculo com esta empresa.
         */
        const { data: existingClient, error: existingClientError } =
          await supabase
            .from("clients")
            .select("id")
            .eq("user_id", loginData.user.id)
            .eq("company_id", companyData.id)
            .maybeSingle();

        if (existingClientError) {
          await supabase.auth.signOut();
          throw existingClientError;
        }

        if (existingClient) {
          await supabase.auth.signOut();

          toast({
            title: "Cadastro já realizado",
            description:
              "Este usuário já está cadastrado como cliente nesta empresa.",
            variant: "destructive",
          });
          return;
        }

        /*
         * O usuário já existe no Auth, mas ainda não pertence
         * à empresa atual. Criamos apenas o vínculo em clients.
         */
        const { error: clientError } = await supabase
          .from("clients")
          .insert({
            user_id: loginData.user.id,
            company_id: companyData.id,
            name: fullName,
            email: validatedData.email,
            phone: validatedData.phone,
            cpf: cleanedCpf || null,
          });

        await supabase.auth.signOut();

        if (clientError) {
          console.error("Error creating client profile:", clientError);

          toast({
            title: "Erro no cadastro",
            description:
              "Não foi possível vincular sua conta a esta empresa.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Cadastro realizado com sucesso!",
          description:
            "Sua conta já existia e foi vinculada a esta empresa. Faça login com a senha da sua conta.",
        });

        if (returnTo) {
          navigate(`/${slug}/entrar?returnTo=${returnTo}`);
        } else {
          navigate(`/${slug}/entrar`);
        }

        return;
      }

      /*
       * Usuário realmente novo no Supabase Auth.
       */
      if (authData.user) {
        const { error: clientError } = await supabase
          .from("clients")
          .insert({
            user_id: authData.user.id,
            company_id: companyData.id,
            name: fullName,
            email: validatedData.email,
            phone: validatedData.phone,
            cpf: cleanedCpf || null,
          });

        if (clientError) {
          console.error("Error creating client profile:", clientError);

          toast({
            title: "Erro no cadastro",
            description:
              "A conta foi criada, mas não foi possível criar o cadastro de cliente.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Cadastro realizado com sucesso!",
          description:
            "Verifique seu email para confirmar a conta e depois faça login.",
        });

        if (returnTo) {
          navigate(`/${slug}/entrar?returnTo=${returnTo}`);
        } else {
          navigate(`/${slug}/entrar`);
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};

        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });

        setErrors(newErrors);
      } else {
        console.error("Unexpected error:", error);

        toast({
          title: "Erro inesperado",
          description: "Ocorreu um erro inesperado. Tente novamente.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">

      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-neon-violet/10 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-neon-pink/10 rounded-full blur-3xl animate-float"></div>
      </div>

      <Card className="w-full max-w-md card-glow bg-card/50 backdrop-blur-sm border-primary/30 relative z-10">

        <CardHeader className="text-center">

          <div className="flex justify-center mb-6">
            <CompanyLogo companySlug={slug || ''} />
          </div>

          <CardTitle className="text-2xl text-gradient">
            Criar conta
          </CardTitle>

          <CardDescription>
            Cadastre-se para agendar seus serviços
          </CardDescription>

        </CardHeader>

        <CardContent>

          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="grid grid-cols-2 gap-4">

              <div className="space-y-2">

                <Label htmlFor="firstName">
                  Nome
                </Label>

                <div className="relative">

                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />

                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="João"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                    required
                  />

                </div>

                {errors.firstName && (
                  <p className="text-sm text-red-500">
                    {errors.firstName}
                  </p>
                )}

              </div>

              <div className="space-y-2">

                <Label htmlFor="lastName">
                  Sobrenome
                </Label>

                <div className="relative">

                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />

                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    placeholder="Silva"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                    required
                  />

                </div>

                {errors.lastName && (
                  <p className="text-sm text-red-500">
                    {errors.lastName}
                  </p>
                )}

              </div>

            </div>

            <div className="space-y-2">

              <Label htmlFor="email">
                Email
              </Label>

              <div className="relative">

                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />

                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                  required
                />

              </div>

              {errors.email && (
                <p className="text-sm text-red-500">
                  {errors.email}
                </p>
              )}

            </div>

            <div className="space-y-2">

              <Label htmlFor="phone">
                Telefone (WhatsApp)
              </Label>

              <PhoneInput
                id="phone"
                value={formData.phone}
                onChange={(v) => {
                  setFormData(prev => ({ ...prev, phone: v }));

                  if (errors.phone) {
                    setErrors(prev => ({
                      ...prev,
                      phone: ""
                    }));
                  }
                }}
                required
              />

              {errors.phone && (
                <p className="text-sm text-red-500">
                  {errors.phone}
                </p>
              )}

            </div>

            <div className="space-y-2">

              <Label htmlFor="cpf">
                CPF (opcional)
              </Label>

              <div className="relative">

                <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />

                <Input
                  id="cpf"
                  name="cpf"
                  type="text"
                  placeholder="000.000.000-00"
                  value={formData.cpf}
                  onChange={handleInputChange}
                  maxLength={14}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                />

              </div>

              {errors.cpf && (
                <p className="text-sm text-red-500">
                  {errors.cpf}
                </p>
              )}

            </div>

            <div className="space-y-2">

              <Label htmlFor="password">
                Senha
              </Label>

              <div className="relative">

                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />

                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                  required
                />

              </div>

              {errors.password && (
                <p className="text-sm text-red-500">
                  {errors.password}
                </p>
              )}

            </div>

            <div className="space-y-2">

              <Label htmlFor="confirmPassword">
                Confirmar senha
              </Label>

              <div className="relative">

                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />

                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                  required
                />

              </div>

              {errors.confirmPassword && (
                <p className="text-sm text-red-500">
                  {errors.confirmPassword}
                </p>
              )}

            </div>

            <Button
              type="submit"
              variant="neon"
              className="w-full"
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? "Criando conta..." : "Criar conta"}
            </Button>

          </form>

          <div className="mt-6 pt-6 border-t border-primary/20 text-center">

            <p className="text-sm text-muted-foreground">

              Já tem uma conta?{" "}

              <Link
                to={`/${slug}/entrar`}
                className="text-primary hover:text-primary-glow transition-colors"
              >
                Entre aqui
              </Link>

            </p>

            <p className="text-sm text-muted-foreground mt-2">

              <Link
                to={`/${slug}`}
                className="text-primary hover:text-primary-glow transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar à página inicial
              </Link>

            </p>

          </div>

        </CardContent>

      </Card>

    </div>
  );
}
