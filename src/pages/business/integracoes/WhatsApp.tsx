import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone } from "lucide-react";

export default function IntegracaoWhatsApp() {
  return (
    <BusinessLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="h-6 w-6" /> Integração WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Conecte uma instância da Evolution API para envio de mensagens.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Em breve</CardTitle>
            <CardDescription>
              Configuração de instâncias da Evolution API (URL, API Key, número conectado e status).
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Esta tela ainda está em desenvolvimento.
          </CardContent>
        </Card>
      </div>
    </BusinessLayout>
  );
}
