import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const passwordSchema = z.object({
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function SetPassword() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const urlToken = searchParams.get("token");
  const returnToParam = searchParams.get("returnTo");

  const { register, handleSubmit, formState: { errors } } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  useEffect(() => {
    (async () => {
      // O fluxo atual de senha contextual usa sempre o token próprio da confirmação.
      // Não usamos supabase.auth.updateUser() porque a senha pertence ao vínculo
      // cliente + empresa e não à identidade global do Auth.
      if (urlToken) {
        setReady(true);
        return;
      }

      // Compatibilidade com links antigos: só permitimos continuar se houver uma
      // sessão Auth ativa. A senha continuará sendo salva exclusivamente em clients.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
      } else {
        const timer = setTimeout(async () => {
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          setReady(!!retrySession);
        }, 2000);
        return () => clearTimeout(timer);
      }
    })();
  }, [urlToken]);

  const onSubmit = async (values: PasswordFormValues) => {
    setLoading(true);
    try {
      if (urlToken) {
        const { data, error } = await supabase.rpc("confirm_client_company_link", {
          p_token: urlToken,
          p_password: values.password
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Erro ao definir senha.");

        toast({ title: "Sucesso!", description: "Sua senha exclusiva para esta empresa foi definida. Agora você pode entrar." });
        navigate(`/${slug}/entrar${returnToParam ? `?returnTo=${returnToParam}` : ''}`);
        return;
      }

      // Fluxo legado sem token: exige uma sessão existente para identificar o cliente,
      // mas NÃO grava a senha no Supabase Auth.
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("Sessão não encontrada. Tente confirmar o link de acesso novamente.");
      }

      const { error: hashError } = await supabase.rpc('set_client_password_hash', {
        p_company_slug: slug,
        p_password: values.password,
      });
      if (hashError) throw hashError;

      toast({ title: "Sucesso!", description: "Sua senha exclusiva para esta empresa foi definida. Agora você pode entrar." });
      navigate(`/${slug}/entrar${returnToParam ? `?returnTo=${returnToParam}` : ''}`);
    } catch (error: any) {
      console.error("Error setting contextual password:", error);
      toast({
        title: "Erro",
        description: error.message || "Ocorreu um erro ao definir sua senha.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
        <Card className="w-full max-w-md card-glow bg-card/50 backdrop-blur-sm border-primary/30">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-gradient">Crie sua Senha</CardTitle>
            <CardDescription>Validando link de confirmação...</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center py-8">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground mt-4">Aguarde um momento...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md card-glow bg-card/50 backdrop-blur-sm border-primary/30">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Crie sua Senha</CardTitle>
          <CardDescription>Defina uma senha exclusiva para acessar esta empresa</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova Senha</Label>
              <PasswordInput id="password" placeholder="********" {...register("password")} showLeftIcon={false} className="bg-background/50" />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <PasswordInput id="confirmPassword" placeholder="********" {...register("confirmPassword")} showLeftIcon={false} className="bg-background/50" />
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Salvar Senha e Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
