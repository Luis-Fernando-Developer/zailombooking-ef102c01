import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface ForgotPasswordDialogProps {
  trigger: React.ReactNode;
  defaultEmail?: string;
  /** When supplied (including an empty string), use company-specific owner credentials instead of Supabase Auth. */
  companySlug?: string;
}

export const ForgotPasswordDialog = ({ trigger, defaultEmail = "", companySlug }: ForgotPasswordDialogProps) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setEmail(defaultEmail);
  }, [defaultEmail, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (companySlug !== undefined) {
        if (!companySlug.trim()) {
          toast({ title: "Informe a empresa", description: "Volte ao formulário de login e informe o identificador da empresa antes de recuperar a senha.", variant: "destructive" });
          return;
        }
        const { data, error } = await supabase.functions.invoke("request-owner-password-reset", {
          body: { email: email.trim(), company_slug: companySlug.trim().toLowerCase() },
        });
        if (error || !data?.success) {
          toast({ title: "Não foi possível solicitar a recuperação", description: "Tente novamente em instantes.", variant: "destructive" });
          return;
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          toast({ title: "Erro", description: error.message, variant: "destructive" });
          return;
        }
      }
      toast({
        title: companySlug !== undefined ? "Solicitação recebida" : "Email enviado!",
        description: companySlug !== undefined
          ? "Se os dados corresponderem a um acesso empresarial, você receberá as instruções no e-mail cadastrado."
          : "Verifique sua caixa de entrada para redefinir a senha.",
      });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Esqueci minha senha</DialogTitle>
          <DialogDescription>
            Informe seu email para receber o link de redefinição de senha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email</Label>
            <Input id="forgot-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required placeholder="seu@email.com" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
