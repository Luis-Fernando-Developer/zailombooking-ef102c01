import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Lock, Mail, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { ForgotPasswordDialog } from "@/components/business/ForgotPasswordDialog";

export default function ClientLogin() {
  const { slug } = useParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSuccess = async (user: any, userEmail: string) => {
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('user_id', user.id)
      .eq('email', userEmail)
      .single();

    toast({
      title: "Login realizado com sucesso!",
      description: `Bem-vindo(a), ${client?.name || 'Cliente'}`,
    });

    const searchParams = new URLSearchParams(window.location.search);
    const returnTo = searchParams.get('returnTo');

    if (returnTo === 'agendar') {
      navigate(`/${slug}/agendar?restore=true`);
    } else {
      navigate(`/${slug}/agendamentos`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log("Tentando validar senha contextual para:", email, "no slug:", slug);
      
      // 1. Validar a senha contextual (multi-empresa) via RPC
      const { data: validData, error: validError } = await supabase.rpc('validate_client_password', {
        p_email: email,
        p_company_slug: slug,
        p_password: password
      });

      console.log("Resultado da validação contextual:", { validData, validError });

      if (validError || !validData?.success) {
        if (validData?.needs_link && validData?.user_id) {
           toast({
             title: "Vínculo necessário",
             description: validData.error,
             variant: "default",
           });
           return;
        }

        toast({
          title: "Atenção",
          description: validData?.error || "A senha informada não corresponde à sua senha cadastrada nesta empresa.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // 2. Tenta autenticar no Supabase Auth globalmente
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.log("Senha da empresa válida, mas Auth Global falhou (senhas diferentes).");
        
        // Se a senha global for diferente, tentamos o login via OTP silencioso ou 
        // instruímos o usuário. Mas para manter a UX fluida sem mudar a senha global,
        // o ideal seria uma Edge Function que gera um session token via Admin API.
        
        // Como não temos a edge function 'login-with-context' ainda, 
        // vamos exibir um erro claro para o usuário sobre a divergência global
        // até que o fluxo de session bypass esteja implementado.
        
        toast({
          title: "Divergência de Acesso",
          description: "Sua senha nesta empresa é válida, mas você possui outra senha em uma empresa diferente. Para sua segurança, use a senha do seu primeiro cadastro ou recupere sua senha.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (data.user) {
        handleSuccess(data.user, email);
      }

    } catch (error) {
      console.error('Error signing in:', error);
      toast({
        title: "Erro no login",
        description: "Ocorreu um erro inesperado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
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
            Acesse sua conta
          </CardTitle>
          <CardDescription>
            Veja e gerencie suas agendamentos aqui!
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end -mt-2">
              <ForgotPasswordDialog
                defaultEmail={email}
                trigger={
                  <button
                    type="button"
                    className="text-sm text-primary hover:text-primary-glow transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                }
              />
            </div>

            <Button
              type="submit"
              variant="neon"
              className="w-full"
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-primary/20 text-center">
            <p className="text-sm text-muted-foreground">
              Não tem uma conta?{" "}
              <Link
                to={`/${slug}/cadastro`}
                className="text-primary hover:text-primary-glow transition-colors"
              >
                Cadastre-se
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
