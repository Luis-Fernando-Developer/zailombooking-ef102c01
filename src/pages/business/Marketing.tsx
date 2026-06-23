import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";
import { Image, Megaphone, CheckSquare, History } from "lucide-react";
import { MaterialsTab } from "@/components/business/marketing/MaterialsTab";
import { CampaignsTab } from "@/components/business/marketing/CampaignsTab";
import { ApprovalsTab } from "@/components/business/marketing/ApprovalsTab";
import { HistoryTab } from "@/components/business/marketing/HistoryTab";

const EDIT_ROLES = new Set(['owner', 'manager', 'rh', 'marketing', 'designer']);
const APPROVE_ROLES = new Set(['owner', 'manager', 'rh']);

export default function BusinessMarketing() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [role, setRole] = useState<string>('guest');

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: c } = await supabase.from('companies').select('id,name,slug,owner_email').eq('slug', slug).single();
        if (!c) return;
        setCompany({ id: c.id, name: c.name, slug: c.slug });
        if (user && c.owner_email?.toLowerCase() === user.email?.toLowerCase()) {
          setRole('owner');
        } else if (user) {
          const { data: emp } = await supabase.from('employees').select('role').eq('company_id', c.id).eq('user_id', user.id).maybeSingle();
          setRole(emp?.role || 'employee');
        }
      } finally { setLoading(false); }
    })();
  }, [slug]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" /></div>;
  if (!company) return <Navigate to="/" replace />;

  const canEdit = EDIT_ROLES.has(role);
  const canApprove = APPROVE_ROLES.has(role);

  return (
    <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={role}>
      <div className="space-y-6 px-10 w-full py-8">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Marketing</h1>
          <p className="text-muted-foreground mt-2">Biblioteca de materiais, campanhas, aprovações e auditoria.</p>
        </div>

        <Tabs defaultValue="materials" className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <TabsTrigger value="materials" className="flex items-center gap-2"><Image className="w-4 h-4" />Materiais</TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-2"><Megaphone className="w-4 h-4" />Campanhas</TabsTrigger>
            <TabsTrigger value="approvals" className="flex items-center gap-2"><CheckSquare className="w-4 h-4" />Aprovações</TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2"><History className="w-4 h-4" />Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="materials" className="mt-6"><MaterialsTab companyId={company.id} canEdit={canEdit} /></TabsContent>
          <TabsContent value="campaigns" className="mt-6"><CampaignsTab companyId={company.id} canEdit={canEdit} /></TabsContent>
          <TabsContent value="approvals" className="mt-6"><ApprovalsTab companyId={company.id} role={role} canApprove={canApprove} /></TabsContent>
          <TabsContent value="history" className="mt-6"><HistoryTab companyId={company.id} /></TabsContent>
        </Tabs>
      </div>
    </BusinessLayout>
  );
}
