import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingLogo } from "@/components/BookingLogo";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export default function ResetOwnerPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const token = params.get("token") || "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      useToastError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      useToastError("A senha deve ter no máximo 72 bytes.");
      return;
    }
    if (password !== confirm) {
      useToastError("As senhas não coincidem.");
      return;
    }
    if (!token) {
      useToastError("O link de recuperação é inválido. Solicite outro link.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-owner-company-password", {
        body: { token, password },
      });
      if (error || !data?.success) {
        useToastError(data?.error || "Não foi possível redefinir a senha. Solicite um novo link.");
        return;
      }
      setCompleted(true);
    } catch {
      useToastError("Não foi possível redefinir a senha. Solicite um novo link.");
    } finally {
      setLoading(false);
    }
  };

  const { toast } = useToast();
  function useToastError(message: string) {
    toast({ title: "Não foi possível redefinir a senha", description: message, variant: "destructive" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-6"><BookingLogo /></div>
          <CardTitle className="text-2xl">{completed ? "Senha redefinida" : "Redefinir senha empresarial"}</CardTitle>
          <CardDescription>{completed ? "A nova senha vale somente para a empresa associada ao link." : "Crie uma nova senha para esta empresa. O link é de uso único."}</CardDescription>
        </CardHeader>
        <CardContent>
          {completed ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Sua senha empresarial foi atualizada. A senha de outras empresas e a identidade global do Zailom não foram alteradas.</p>
              <Button className="w-full" onClick={() => navigate("/login")}>Voltar ao login</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="owner-new-password">Nova senha</Label>
                <PasswordInput id="owner-new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} required showLeftIcon={false} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-confirm-password">Confirmar nova senha</Label>
                <PasswordInput id="owner-confirm-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} maxLength={72} required showLeftIcon={false} />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token}>{loading ? "Salvando..." : "Redefinir senha"}</Button>
              {!token && <p className="text-sm text-destructive">O link está incompleto. Solicite uma nova recuperação.</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
