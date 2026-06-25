import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function AutomacaoPlaceholder({ title, description, icon: Icon }: Props) {
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
            <Icon className="h-6 w-6" /> {title}
          </h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Em breve</CardTitle>
            <CardDescription>Esta automação ainda está em desenvolvimento.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Em breve você poderá configurar regras, gatilhos e mensagens aqui.
          </CardContent>
        </Card>
      </div>
    </BusinessLayout>
  );
}
