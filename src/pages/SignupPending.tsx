import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";

export default function SignupPending() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md bg-card/50 backdrop-blur-sm border-primary/20 text-center">
        <CardHeader>
          <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-gradient">Cadastro Quase Pronto!</CardTitle>
          <CardDescription>Enviamos um e-mail de confirmação para você.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            Por favor, verifique sua caixa de entrada e clique no link de confirmação para ativar sua conta e começar a usar o BookingFy.
          </p>
          <p className="text-sm text-muted-foreground">
            Não recebeu o e-mail? Verifique sua pasta de spam ou tente novamente em alguns minutos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
