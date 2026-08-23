import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Save, Lock, Monitor, Smartphone, Tablet, Palette, Type, Image, Layout, Code } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { BodySettings } from "./personalization/BodySettings";
import { HeaderSettings } from "./personalization/HeaderSettings";
import { HeroSettings } from "./personalization/HeroSettings";
import { ServicesSettings } from "./personalization/ServicesSettings";
import { ProfessionalsSettings } from "./personalization/ProfessionalsSettings";
import { AboutSettings } from "./personalization/AboutSettings";
import { FooterSettings } from "./personalization/FooterSettings";
import { CodeEditor } from "./CodeEditor";
import { type CustomizationData, defaultTypography } from "./personalization/types";

interface LandingPageCustomizerProps {
  companyId: string;
  companyPlan: string;
  canEdit: boolean;
  className?: string;
}

export function LandingPageCustomizer({ companyId, companyPlan, canEdit, className }: LandingPageCustomizerProps) {
  const [customization, setCustomization] = useState<CustomizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const { toast } = useToast();

  const isPremiumPlan = companyPlan !== "starter";
  const isLocked = !isPremiumPlan || !canEdit;

  const defaultData: CustomizationData = {
    body: { font_family: 'Inter', background_color: '#ffffff' },
    header: {
      position: 'fixed',
      background_type: 'solid',
      background_color: '#3b82f6',
      background_gradient: null,
      menu_typography: { ...defaultTypography, color: '#ffffff' },
      buttons: { background_color: '#ffffff', typography: { ...defaultTypography, color: '#3b82f6' } }
    },
    hero: {
      background_type: 'gradient',
      background_color: '#3b82f6',
      background_gradient: { type: 'linear', angle: 135, colors: ['#3b82f6', '#8b5cf6'] },
      title_typography: { ...defaultTypography, size: 48, weight: '700', color: '#ffffff', text: 'Agendamentos Inteligentes' },
      description_typography: { ...defaultTypography, size: 18, color: '#e2e8f0', text: 'Transforme seu negócio com nossa plataforma.' },
      buttons: { background_color: '#ffffff', typography: { ...defaultTypography, color: '#3b82f6', text: 'Agendar Agora' } },
      show: true
    },
    services: {
      background_color: '#f8fafc',
      title_typography: { ...defaultTypography, size: 32, weight: '700', alignment: 'center', text: 'Nossos Serviços' }
    },
    professionals: {
      background_color: '#ffffff',
      title_typography: { ...defaultTypography, size: 32, weight: '700', alignment: 'center', text: 'Profissionais' }
    },
    about: {
      background_color: '#f8fafc',
      title_typography: { ...defaultTypography, size: 32, weight: '700', text: 'Sobre a Empresa' }
    },
    footer: {
      background_type: 'solid',
      background_color: '#1e293b',
      background_gradient: null,
      typography: { ...defaultTypography, color: '#ffffff' }
    },
    extra: { custom_css: '' }
  };

  useEffect(() => {
    fetchCustomization();
  }, [companyId]);

  const fetchCustomization = async () => {
    try {
      const { data, error } = await supabase
        .from('company_customizations')
        .select('theme')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data && data.theme) {
        setCustomization({ ...defaultData, ...data.theme });
      } else {
        setCustomization(defaultData);
      }
    } catch (error) {
      console.error('Error fetching customization:', error);
      toast({ title: "Erro", description: "Erro ao carregar configurações", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveCustomization = async () => {
    if (!customization) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('company_customizations')
        .upsert(
          {
            company_id: companyId,
            theme: customization,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'company_id' }
        );

      if (error) throw error;
      toast({ title: "Sucesso", description: "Personalização salva!" });
    } catch (error) {
      console.error('Error saving customization:', error);
      toast({ title: "Erro", description: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!customization) return null;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5" />
          <CardTitle>Personalização da Landing Page</CardTitle>
          {isLocked && <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" /> Bloqueado</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted p-1 rounded-md mr-4">
            <Button variant={previewDevice === "desktop" ? "secondary" : "ghost"} size="icon" onClick={() => setPreviewDevice("desktop")}><Monitor className="w-4 h-4" /></Button>
            <Button variant={previewDevice === "tablet" ? "secondary" : "ghost"} size="icon" onClick={() => setPreviewDevice("tablet")}><Tablet className="w-4 h-4" /></Button>
            <Button variant={previewDevice === "mobile" ? "secondary" : "ghost"} size="icon" onClick={() => setPreviewDevice("mobile")}><Smartphone className="w-4 h-4" /></Button>
          </div>
          <Button onClick={saveCustomization} disabled={saving || isLocked}><Save className="w-4 h-4 mr-2" />{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="body">
          <TabsList className="grid grid-cols-4 md:grid-cols-8 gap-2 h-auto">
            <TabsTrigger value="body">Corpo</TabsTrigger>
            <TabsTrigger value="header">Header</TabsTrigger>
            <TabsTrigger value="hero">Hero</TabsTrigger>
            <TabsTrigger value="services">Serviços</TabsTrigger>
            <TabsTrigger value="professionals">Profissionais</TabsTrigger>
            <TabsTrigger value="about">Sobre</TabsTrigger>
            <TabsTrigger value="footer">Rodapé</TabsTrigger>
            <TabsTrigger value="extra">CSS</TabsTrigger>
          </TabsList>

          <TabsContent value="body" className="pt-4"><BodySettings config={customization.body as any} onChange={(val) => setCustomization({ ...customization, body: val as any })} disabled={isLocked} /></TabsContent>
          <TabsContent value="header" className="pt-4"><HeaderSettings config={customization.header as any} onChange={(val) => setCustomization({ ...customization, header: val as any })} disabled={isLocked} /></TabsContent>
          <TabsContent value="hero" className="pt-4"><HeroSettings config={customization.hero as any} onChange={(val) => setCustomization({ ...customization, hero: val as any })} disabled={isLocked} /></TabsContent>
          <TabsContent value="services" className="pt-4"><ServicesSettings config={customization.services} onChange={(val) => setCustomization({ ...customization, services: val })} disabled={isLocked} /></TabsContent>
          <TabsContent value="professionals" className="pt-4"><ProfessionalsSettings config={customization.professionals} onChange={(val) => setCustomization({ ...customization, professionals: val })} disabled={isLocked} /></TabsContent>
          <TabsContent value="about" className="pt-4"><AboutSettings config={customization.about} onChange={(val) => setCustomization({ ...customization, about: val })} disabled={isLocked} /></TabsContent>
          <TabsContent value="footer" className="pt-4"><FooterSettings config={customization.footer as any} onChange={(val) => setCustomization({ ...customization, footer: val as any })} disabled={isLocked} /></TabsContent>
          <TabsContent value="extra" className="pt-4"><CodeEditor code={customization.extra.custom_css} onChange={(val) => setCustomization({ ...customization, extra: { ...customization.extra, custom_css: val } })} onSave={saveCustomization} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
