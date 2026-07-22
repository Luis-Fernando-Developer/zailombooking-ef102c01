import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone } from "lucide-react";
import { ChannelStatusCard } from "@/components/business/whatsapp/ChannelStatusCard";
import { ApiWhatsappConfigCard } from "@/components/business/whatsapp/ApiWhatsappConfigCard";
import { InstancesList } from "@/components/business/whatsapp/InstancesList";
import { TemplatesEditor } from "@/components/business/whatsapp/TemplatesEditor";

export default function IntegracaoWhatsApp() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!slug) return;
    supabase.from("companies").select("id,name").eq("slug", slug).maybeSingle().then(({ data }) => {
      if (data) { setCompanyId(data.id); setCompanyName(data.name); }
    });
  }, [slug]);

  if (!companyId) return null;

  return (
    <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId} userRole="owner" currentUser={user}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="h-6 w-6" /> Integração WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Conecte sua API WhatsApp e defina como o Booking envia notificações.
          </p>
        </div>

        <Tabs defaultValue="channel" className="space-y-4">
          <TabsList>
            <TabsTrigger value="channel">Canal</TabsTrigger>
            <TabsTrigger value="instances">Conexões</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="channel" className="space-y-4">
            <ChannelStatusCard companyId={companyId} onChanged={() => setReloadKey((k) => k + 1)} />
            <ApiWhatsappConfigCard companyId={companyId} onChanged={() => setReloadKey((k) => k + 1)} />
          </TabsContent>

          <TabsContent value="instances">
            <InstancesList key={reloadKey} companyId={companyId} />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesEditor companyId={companyId} />
          </TabsContent>
        </Tabs>
      </div>
    </BusinessLayout>
  );
}
