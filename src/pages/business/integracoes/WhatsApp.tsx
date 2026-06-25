import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone } from "lucide-react";

export default function IntegracaoWhatsApp() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    supabase.from("companies").select("id,name").eq("slug", slug).maybeSingle().then(({ data }) => {
      if (data) {
        setCompanyId(data.id);
        setCompanyName(data.name);
      }
    });
  }, [slug]);

  return (
    <BusinessLayout
      companySlug={slug!}
      companyName={companyName}
      companyId={companyId ?? undefined}
      userRole="owner"
      currentUser={user}
    >
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
