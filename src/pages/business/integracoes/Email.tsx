import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";

export default function IntegracaoEmail() {
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
            <Mail className="h-6 w-6" /> Integração E-mail
          </h1>
          <p className="text-muted-foreground">
            Configure um provedor SMTP / API para envio de e-mail marketing e transacionais.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Em breve</CardTitle>
            <CardDescription>
              Configuração de provedor (Resend, SendGrid, SMTP) com remetente verificado.
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
