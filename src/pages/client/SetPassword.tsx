import { useState } from "react";
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
  
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  const { register, handleSubmit, formState: { errors } } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (values: PasswordFormValues) => {
    if (!token) {
      toast({
        title: "Erro",
        description: "Token de confirmação não encontrado.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Usamos a mesma RPC que confirma o vínculo, mas agora passando a senha para salvar o hash
      const { data, error } = await supabase.rpc("confirm_client_company_link", {
        p_token: token,
        p_password: values.password
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Sucesso!",
          description: "Sua senha foi definida com sucesso. Agora você pode entrar.",
        });
        const searchParams = new URLSearchParams(window.location.search);
        const returnTo = searchParams.get("returnTo");
        navigate(`/${slug}/entrar${returnTo ? `?returnTo=${returnTo}` : ''}`);
      } else {
        throw new Error(data?.error || "Erro ao definir senha.");
      }
    } catch (error: any) {
      console.error("Error setting password:", error);
      toast({
        title: "Erro",
        description: error.message || "Ocorreu um erro ao definir sua senha.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
              <PasswordInput
                id="password"
                placeholder="********"
                {...register("password")}
                showLeftIcon={false}
                className="bg-background/50"
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="********"
                {...register("confirmPassword")}
                showLeftIcon={false}
                className="bg-background/50"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
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
