import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Mail, ArrowLeft, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { ForgotPasswordDialog } from "@/components/business/ForgotPasswordDialog";

type AccessStatus = "idle" | "checking" | "password" | "first_access" | "unknown";

export default function ClientLogin() {
  const { slug } = useParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [firstAccessLoading, setFirstAccessLoading] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("idle");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCheckAccess = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !slug) {
      if (normalizedEmail) {
        toast({ title: "Confira o e-mail", description: "Digite um endereço de e-mail válido.", variant: "destructive" });
      }
      return;
    }
    if (accessStatus === "checking") return;

    setAccessStatus("checking");
    try {
      const { data, error } = await supabase.functions.invoke("login-with-context", {
        body: { email: normalizedEmail, company_slug: slug, action: "check_access" },
      });
      if (error) throw error;
      setPassword("");
      setAccessStatus(data?.has_password ? "password" : "first_access");
    } catch (error) {
      console.error("Erro ao verificar acesso do cliente:", error);
      // Se a verificação falhar, ainda permitimos tentar entrar ou pedir o primeiro acesso.
      setAccessStatus("unknown");
    }
  };

  const handleFirstAccess = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      toast({ title: "Informe seu e-mail", description: "Digite o e-mail usado no cadastro do cliente.", variant: "destructive" });
      return;
    }

    setFirstAccessLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-client-access", {
        body: { email: normalizedEmail, company_slug: slug },
      });
      if (error) throw error;
      toast({
        title: "Solicitação processada",
        description: data?.message || "Se o cadastro existir, enviaremos as instruções de primeiro acesso.",
      });
    } catch (error) {
      console.error("Erro ao solicitar primeiro acesso:", error);
      toast({
        title: "Não foi possível solicitar o acesso",
        description: "Não conseguimos processar a solicitação agora. Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setFirstAccessLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accessStatus !== "password" && accessStatus !== "unknown") {
      await handleCheckAccess();
      return;
    }
    setIsLoading(true);

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const returnTo = searchParams.get("returnTo");
      const { data, error } = await supabase.functions.invoke("login-with-context", {
        body: { email: email.trim(), password, company_slug: slug, returnTo, origin: window.location.origin },
      });

      if (error || !data?.success) {
        const rawError = String(data?.error || "");
        const containsTechnicalDetails = /edge function|function returned|rpc|postgres|sqlstate|database|internal server|stack trace|supabase/i.test(rawError);
        const errorMsg = containsTechnicalDetails
          ? "E-mail ou senha incorretos para esta empresa. Se ainda não criou uma senha aqui, use a opção Primeiro acesso."
          : (rawError || "E-mail ou senha incorretos para esta empresa.");

        if (data?.needs_link) {
          toast({ title: "Vínculo necessário", description: "Você já possui conta no Zailom. Verifique seu e-mail/WhatsApp para confirmar seu vínculo com esta empresa." });
        } else if (data?.needs_first_access) {
          setAccessStatus("first_access");
          toast({ title: "Primeiro acesso necessário", description: "Você ainda não criou uma senha para esta empresa. Solicite seu primeiro acesso abaixo.", variant: "destructive" });
        } else {
          toast({ title: "Não foi possível entrar", description: errorMsg, variant: "destructive" });
        }
        setIsLoading(false);
        return;
      }

      if (data.action_link) {
        window.location.replace(data.action_link);
      } else {
        throw new Error("Resposta de login inválida.");
      }
    } catch (error) {
      console.error("Erro ao entrar:", error);
      toast({ title: "Erro no login", description: "Não foi possível realizar o login agora. Confira os dados e tente novamente.", variant: "destructive" });
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
          <div className="flex justify-center mb-6"><CompanyLogo companySlug={slug || ""} /></div>
          <CardTitle className="text-2xl text-gradient">Acesse sua conta</CardTitle>
          <CardDescription>A senha é exclusiva de cada empresa. Informe seu e-mail para continuar.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setPassword(""); setAccessStatus("idle"); }}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {(accessStatus === "idle" || accessStatus === "checking") && (
              <Button type="button" variant="neon" className="w-full" size="lg" disabled={accessStatus === "checking" || !email.trim()} onClick={() => void handleCheckAccess()}>
                {accessStatus === "checking" ? "Verificando acesso..." : "Continuar"}
              </Button>
            )}

            {(accessStatus === "password" || accessStatus === "unknown") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha desta empresa</Label>
                  <PasswordInput id="password" placeholder="Digite sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="flex justify-end -mt-2">
                  <ForgotPasswordDialog defaultEmail={email} trigger={<button type="button" className="text-sm text-primary hover:text-primary-glow transition-colors">Esqueci minha senha</button>} />
                </div>
                <Button type="submit" variant="neon" className="w-full" disabled={isLoading || !password} size="lg">
                  {isLoading ? "Entrando..." : "Entrar"}
                </Button>
                {accessStatus === "unknown" && (
                  <Button type="button" variant="outline" className="w-full" disabled={firstAccessLoading} onClick={handleFirstAccess}>
                    <KeyRound className="w-4 h-4 mr-2" />
                    {firstAccessLoading ? "Enviando..." : "Primeiro acesso / Criar senha"}
                  </Button>
                )}
              </>
            )}

            {accessStatus === "first_access" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Se você já foi cadastrado nesta empresa e ainda não criou sua senha de acesso, solicite o primeiro acesso abaixo.
                </p>
                <Button type="button" variant="neon" className="w-full" disabled={firstAccessLoading} onClick={handleFirstAccess}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  {firstAccessLoading ? "Enviando..." : "Primeiro acesso / Criar senha"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setAccessStatus("password")}>
                  Já possui senha? Entrar
                </Button>
              </div>
            )}
          </form>

          <div className="mt-6 pt-6 border-t border-primary/20 text-center">
            <p className="text-sm text-muted-foreground">Não tem uma conta?{" "}<Link to={`/${slug}/cadastro`} className="text-primary hover:text-primary-glow transition-colors">Cadastre-se</Link></p>
            <p className="text-sm text-muted-foreground mt-2"><Link to={`/${slug}`} className="text-primary hover:text-primary-glow transition-colors inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" />Voltar à página inicial</Link></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
