import { useState, useEffect, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ColorPicker } from "./ColorPicker";
import { CodeEditor } from "./CodeEditor";
import { LogoUploader } from "./LogoUploader";
import { Save, Lock, Unlock, Upload, Link, Palette, Type, Image, Layout, Code, Camera, Monitor, Smartphone, Tablet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { BookingLogo } from "../BookingLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { BodySettings, type BodyConfig } from "./personalization/BodySettings";
import { HeaderSettings, type HeaderConfig } from "./personalization/HeaderSettings";
import { HeroSettings, type HeroConfig } from "./personalization/HeroSettings";
import { ButtonSettings, type ButtonConfig } from "./personalization/ButtonSettings";
import { CardSettings, type CardConfig } from "./personalization/CardSettings";
import { FooterSettings, type FooterConfig } from "./personalization/FooterSettings";
import { defaultTypography } from "./personalization/types";

interface Employee {
  id: string;
  name: string;
  avatar_url: string | null;
}
interface LandingPageCustomizerProps {
  companyId: string;
  companyPlan: string;
  canEdit: boolean;
  className: string;
}

interface CustomizationData {
  // Body (Fallback & Global)
  body?: BodyConfig;

  // Header
  header?: HeaderConfig;
  header_position: string; // Keep for compatibility
  logo_type: string;
  logo_url: string;
  logo_upload_path: string;
  header_background_type: string;
  header_background_color: string;
  header_background_gradient: any;

  // Font (Legacy - Keep for compatibility)
  font_family: string;
  font_size_base: number;
  font_color_type: string;
  font_color: string;
  font_gradient: any;
  
  // Hero
  hero?: HeroConfig;
  hero_banner_type: string;
  hero_banner_urls: string[];
  hero_background_type: string;
  hero_background_color: string;
  hero_background_gradient: any;
  hero_title: string;
  hero_description: string;
  hero_content_position: string;
  
  // Buttons
  buttons?: ButtonConfig;
  button_color_type: string;
  button_color: string;
  button_gradient: any;
  
  // Cards
  cards?: CardConfig;
  cards_show_images: boolean;
  cards_layout: string;
  cards_font_family: string;
  cards_color_type: string;
  cards_color: string;
  cards_gradient: any;
  
  // Extra section
  extra_section_enabled: boolean;
  extra_section_code: string;
  
  // Footer
  footer?: FooterConfig;
  footer_background_type: string;
  footer_background_color: string;
  footer_background_gradient: any;
  footer_font_family: string;
}

const fontOptions = [
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Poppins", label: "Poppins" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Berkshire Swash", label: "Berkshire Swash" },
  { value: "My Soul", label: "My Soul" },
  { value: "Bebas Neue", label: "Bebas Neue" },
  { value: "Rubik Puddles", label: "Rubik Puddles" },
  { value: "Henny Penny", label: "Henny Penny" },
  { value: "Londrina Shadow", label: "Londrina Shadow" },
  { value: "Lavishly Yours", label: "Lavishly Yours" },
  { value: "Fleur De Leah", label: "Fleur De Leah" },
  { value: "Tangerine", label: "Tangerine" },
  { value: "Ballet", label: "Ballet" },
  { value: "Mea Culpa", label: "Mea Culpa" },
  { value: "Imperial Script", label: "Imperial Script" },
  { value: "Manufacturing Consent", label: "Manufacturing Consent" },
];

export function LandingPageCustomizer({ companyId, companyPlan, canEdit, className }: LandingPageCustomizerProps) {
  const [customization, setCustomization] = useState<CustomizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [employee, setEmployee] = useState<Employee>({ id: '1', name: 'Luis Fernando', avatar_url: null });
  

  const isPremiumPlan = companyPlan !== "starter";
  const isLocked = !isPremiumPlan || !canEdit;

  // Default customization data moved outside for global access
  const defaultData: CustomizationData = {
    body: {
      background_type: 'solid',
      background_color: '#ffffff',
      default_font_family: 'Inter',
      default_text_color: '#000000',
      default_font_size: 16,
      max_width: 1200
    },
    header: {
      position: 'fixed',
      background_type: 'solid',
      background_color: 'hsl(251, 91%, 65%)',
      menu_typography: { ...defaultTypography, color: '#ffffff' }
    },
    hero: {
      background_type: 'gradient',
      background_gradient: { type: "linear", angle: 135, colors: ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)", "hsl(240, 10%, 3.9%)"] },
      title_typography: { ...defaultTypography, size: 48, weight: "700", color: "#ffffff" },
      description_typography: { ...defaultTypography, size: 18, color: "#eeeeee" }
    },
    buttons: {
      background_type: 'solid',
      background_color: 'hsl(251, 91%, 65%)',
      typography: { ...defaultTypography, weight: "600", color: "#ffffff" },
      border_radius: 8,
      padding_v: 12,
      padding_h: 24
    },
    cards: {
      background_type: 'solid',
      background_color: '#ffffff',
      title_typography: { ...defaultTypography, size: 22, weight: "600" },
      description_typography: { ...defaultTypography, size: 16, color: "#666666" },
      border_radius: 12,
      has_shadow: true
    },
    footer: {
      background_type: 'gradient',
      background_gradient: { type: "linear", angle: 180, colors: ["hsl(240, 10%, 3.9%)", "hsl(251, 91%, 65%)"] },
      title_typography: { ...defaultTypography, size: 20, color: "#ffffff" },
      text_typography: { ...defaultTypography, size: 14, color: "#cccccc" }
    },
    header_position: 'fixed',
    logo_type: 'url',
    logo_url: '',
    logo_upload_path: '',
    header_background_type: 'solid',
    header_background_color: 'hsl(251, 91%, 65%)',
    header_background_gradient: { type: "linear", angle: 45, colors: ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)"] },
    font_family: 'Inter',
    font_size_base: 16,
    font_color_type: 'solid',
    font_color: 'hsl(240, 10%, 3.9%)',
    font_gradient: { type: "linear", angle: 45, colors: ["hsl(240, 10%, 3.9%)", "hsl(251, 91%, 65%)"] },
    hero_banner_type: 'single',
    hero_banner_urls: [],
    hero_background_type: 'gradient',
    hero_background_color: 'hsl(240, 10%, 3.9%)',
    hero_background_gradient: { type: "linear", angle: 135, colors: ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)", "hsl(240, 10%, 3.9%)"] },
    hero_title: 'Agendamentos Inteligentes',
    hero_description: 'Transforme a gestão do seu negócio com nossa plataforma completa de agendamentos online.',
    hero_content_position: 'absolute',
    button_color_type: 'solid',
    button_color: 'hsl(251, 91%, 65%)',
    button_gradient: { type: "linear", angle: 45, colors: ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)"] },
    cards_show_images: false,
    cards_layout: 'vertical',
    cards_font_family: 'Inter',
    cards_color_type: 'solid',
    cards_color: 'hsl(240, 10%, 3.9%)',
    cards_gradient: { type: "linear", angle: 45, colors: ["hsl(240, 10%, 3.9%)", "hsl(251, 91%, 65%)"] },
    extra_section_enabled: false,
    extra_section_code: '',
    footer_background_type: 'gradient',
    footer_background_color: 'hsl(240, 10%, 3.9%)',
    footer_background_gradient: { type: "linear", angle: 180, colors: ["hsl(240, 10%, 3.9%)", "hsl(251, 91%, 65%)"] },
    footer_font_family: 'Inter',
  };

  useEffect(() => {
    fetchCustomization();
  }, [companyId]);

  const fetchCustomization = async () => {
    try {
      const { data, error } = await supabase
        .from('company_customizations')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        const themeData = typeof data.theme === 'object' && data.theme !== null 
          ? data.theme as Record<string, any>
          : {};
        
        setCustomization({
          ...defaultData,
          ...data,
          ...themeData
        });
      } else {
        setCustomization(defaultData);
      }
    } catch (error) {
      console.error('Error fetching customization:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar configurações de personalização",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sanitizeTheme = (theme: any) => {
    if (!theme || typeof theme !== 'object') return theme;
    
    const sanitized = { ...theme };
    const fieldsToSanitize = ['body', 'header', 'hero', 'buttons', 'cards', 'footer'];
    
    // Explicit lists of fields that ARE allowed to be objects
    const validObjectFields = [
      'gradient', 
      'background_gradient', 
      'cta_button', 
      'menu_typography', 
      'typography', 
      'title_typography', 
      'description_typography', 
      'text_typography', 
      'price_typography', 
      'links_typography', 
      'banner_urls'
    ];

    const sanitizeObject = (obj: any, path: string = ''): any => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
      
      const cleanObj: any = { ...obj };
      
      Object.keys(cleanObj).forEach(key => {
        const val = cleanObj[key];
        const currentPath = path ? `${path}.${key}` : key;
        
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          // If it's a known object container, recurse
          if (validObjectFields.includes(key)) {
            cleanObj[key] = sanitizeObject(val, currentPath);
          } else {
            // CRITICAL: This is a primitive field (string/number) that somehow got an object
            console.error(`[Sanitize] CRITICAL React #310 Prevention: Deleting invalid nested object at "${currentPath}"`, val);
            delete cleanObj[key];
          }
        }
      });
      
      return cleanObj;
    };
    
    fieldsToSanitize.forEach(sectionKey => {
      if (sanitized[sectionKey] && typeof sanitized[sectionKey] === 'object') {
        sanitized[sectionKey] = sanitizeObject(sanitized[sectionKey], sectionKey);
      }
    });

    return sanitized;
  };

  const saveCustomization = async () => {
    if (!customization) return;

    setSaving(true);
    try {
      const hero_banner_urls = customization.hero_banner_urls.filter(url => typeof url === 'string' && url.trim() !== "");
      
      // Separate theme data for the JSONB column
      const { body, header, hero, buttons, cards, footer, ...baseData } = customization;
      const theme = sanitizeTheme({ body, header, hero, buttons, cards, footer });

      const { error } = await supabase
        .from('company_customizations')
        .upsert({
          ...baseData,
          company_id: companyId,
          hero_banner_urls,
          theme,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Personalização salva com sucesso!",
      });
      
      // Refresh local state with sanitized data
      setCustomization({
        ...customization,
        ...theme
      });
    } catch (error) {
      console.error('Error saving customization:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar personalização",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateCustomization = (field: keyof CustomizationData, value: any) => {
    if (!customization) return;
    
    // Safety check for objects passed to primitive fields
    if (value && typeof value === 'object' && !Array.isArray(value) && !['body', 'header', 'hero', 'buttons', 'cards', 'footer', 'hero_banner_urls', 'font_gradient', 'header_background_gradient', 'button_gradient', 'cards_gradient', 'footer_background_gradient'].includes(field)) {
      console.error(`[LandingPageCustomizer] Prevented invalid object update for field "${field}":`, value);
      return;
    }

    setCustomization({ ...customization, [field]: value });
  };


  const addBannerUrl = () => {
    if (!customization) return;
    const urls = [...customization.hero_banner_urls, ""];
    updateCustomization('hero_banner_urls', urls);
  };

  const updateBannerUrl = (index: number, url: string) => {
    if (!customization) return;
    const urls = [...customization.hero_banner_urls];
    urls[index] = url;
    updateCustomization('hero_banner_urls', urls);
  };

  const removeBannerUrl = (index: number) => {
    if (!customization) return;
    const urls = customization.hero_banner_urls.filter((_, i) => i !== index);
    updateCustomization('hero_banner_urls', urls);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  if (!customization) return null;

  // function getInitials(name: string): ReactNode {
  //   if (!name) return null;
  //   const words = name.trim().split(/\s+/);
  //   const initials = words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
  //   return initials;
  // }

  // async function handleLogoClick(): Promise<void> {
  //   if (isLocked) return;
  //   // Open file picker for image upload
  //   const input = document.createElement('input');
  //   input.type = 'file';
  //   input.accept = 'image/*';
  //   input.onchange = async (e: any) => {
  //     const file = e.target.files?.[0];
  //     if (!file) return;

  //     try {
  //       // Upload to Supabase Storage (assuming 'avatars' bucket)
  //       const fileExt = file.name.split('.').pop();
  //       const fileName = `${companyId}-logo.${fileExt}`;
  //       const { data, error } = await supabase.storage
  //         .from('logo')
  //         .upload(fileName, file, { upsert: true });

  //       if (error) throw error;

  //       // Get public URL
  //       const { data: urlData } = supabase.storage
  //         .from('logo')
  //         .getPublicUrl(fileName);

  //       const logoUrl = urlData?.publicUrl;
  //       setEmployee((prev) => ({ ...prev, logo_url: logoUrl }));

  //       toast({
  //         title: "Sucesso",
  //         description: "Logotipo atualizado!",
  //       });
  //     } catch (err) {
  //       toast({
  //         title: "Erro",
  //         description: "Falha ao atualizar Logotipo.",
  //         variant: "destructive",
  //       });
  //     }
  //   };
  //   input.click();
  // }

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="h-fit flex flex-col items-center justify-between ">
          <div className="w-full flex flex-col h-full justify-center gap-6 ">
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                <h3 className="text-lg font-bold">
                  Personalização da Landing Page
                </h3>
              </div>
              <div className="flex items-center bg-muted rounded-lg p-1 gap-1">
                <Button 
                  variant={previewDevice === "desktop" ? "secondary" : "ghost"} 
                  size="icon" 
                  className="w-8 h-8"
                  onClick={() => setPreviewDevice("desktop")}
                >
                  <Monitor className="w-4 h-4" />
                </Button>
                <Button 
                  variant={previewDevice === "tablet" ? "secondary" : "ghost"} 
                  size="icon" 
                  className="w-8 h-8"
                  onClick={() => setPreviewDevice("tablet")}
                >
                  <Tablet className="w-4 h-4" />
                </Button>
                <Button 
                  variant={previewDevice === "mobile" ? "secondary" : "ghost"} 
                  size="icon" 
                  className="w-8 h-8"
                  onClick={() => setPreviewDevice("mobile")}
                >
                  <Smartphone className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between w-full gap-2 ">

              {isLocked && (
                <Badge variant="secondary" className="rounded-sm  flex items-center flex-1 h-4 justify-center">
                  <Lock className="w-3 h-3 mr-1" />
                  {!isPremiumPlan ? "Plano Premium Necessário" : "Sem Permissão"}
                </Badge>
              )}
              {!isLocked && (
                <Badge variant="outline" className="rounded-sm  flex items-center flex-1 h-4 p-4 justify-center">
                  <Unlock className="w-3 h-3 mr-1 " />
                  Desbloqueado
                </Badge>
              )}
              <Button className="flex-1" onClick={saveCustomization} disabled={saving || isLocked} size="sm">
                <Save className="w-3 h-3 mr-2" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            {!isPremiumPlan && (
              <Button variant="outline" size="sm">
                Upgrade de Plano
              </Button>
            )}
            
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="header" className="w-full">
          <TabsList className="flex w-full flex-wrap h-auto gap-1 justify-start sm:grid sm:grid-cols-4 lg:grid-cols-7">
            <TabsTrigger value="body" className="flex-1 min-w-[80px]">Body</TabsTrigger>
            <TabsTrigger value="header" className="flex-1 min-w-[80px]">Header</TabsTrigger>
            <TabsTrigger value="hero" className="flex-1 min-w-[80px]">Hero</TabsTrigger>
            <TabsTrigger value="buttons" className="flex-1 min-w-[80px]">Botões</TabsTrigger>
            <TabsTrigger value="cards" className="flex-1 min-w-[80px]">Cards</TabsTrigger>
            <TabsTrigger value="footer" className="flex-1 min-w-[80px]">Rodapé</TabsTrigger>
            <TabsTrigger value="extra" className="flex-1 min-w-[80px]">Extra</TabsTrigger>
          </TabsList>

          <TabsContent value="body" className="space-y-4 pt-4">
            <BodySettings 
              config={customization.body || {}}
              onChange={(val) => updateCustomization('body', val)}
              disabled={isLocked}
            />
          </TabsContent>

          <TabsContent value="header" className="space-y-4 pt-4">
            <HeaderSettings 
              config={customization.header || {}}
              onChange={(val) => updateCustomization('header', val)}
              disabled={isLocked}
            />
            
            <div className="mt-8 border-t pt-8">
              <h4 className="text-sm font-bold uppercase tracking-wider mb-4 opacity-70">Configurações Gerais do Header</h4>
              <div className="space-y-8">
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="space-y-4">
                    <Select 
                      key={`logo-type-${customization.logo_type}`}
                      value={customization.logo_type || 'url'} 
                        onValueChange={(value) => {
                          setCustomization((prev) => {
                            if (!prev) return prev;
                            const next = { ...prev, logo_type: value } as CustomizationData;
                            if (value === 'url') {
                              next.logo_upload_path = '';
                            } else {
                              next.logo_url = '';
                            }
                            return next;
                          });
                        }}
                      disabled={isLocked}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="url">Por URL</SelectItem>
                        <SelectItem value="upload">Por Upload</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {customization.logo_type === 'url' ? (
                      <div>
                        <Input
                          placeholder="URL da logo (deixe vazio para usar o nome da empresa)"
                          value={customization.logo_url || ''}
                          onChange={(e) => updateCustomization('logo_url', e.target.value)}
                          disabled={isLocked}
                        />
                      </div>
                    ) : (
                      <LogoUploader
                        currentLogo={customization.logo_upload_path || undefined}
                        onLogoChange={(path) => updateCustomization('logo_upload_path', path)}
                        companyId={companyId}
                        disabled={isLocked}
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Posição do Header</Label>
                  <Select 
                    value={customization.header_position} 
                    onValueChange={(value) => updateCustomization('header_position', value)}
                    disabled={isLocked}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixo</SelectItem>
                      <SelectItem value="relative">Relativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="hero" className="space-y-4 pt-4">
            <HeroSettings 
              config={customization.hero || {}}
              onChange={(val) => updateCustomization('hero', val)}
              disabled={isLocked}
            />

            <div className="mt-8 border-t pt-8">
              <h4 className="text-sm font-bold uppercase tracking-wider mb-4 opacity-70">Configurações Gerais do Hero</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Título (Texto)</Label>
                  <Input
                    value={customization.hero_title}
                    onChange={(e) => updateCustomization('hero_title', e.target.value)}
                    disabled={isLocked}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Banner</Label>
                  <Select 
                    value={customization.hero_banner_type} 
                    onValueChange={(value) => updateCustomization('hero_banner_type', value)}
                    disabled={isLocked}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Banner Único</SelectItem>
                      <SelectItem value="carousel">Carrossel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Label>Descrição (Texto)</Label>
                <Textarea
                  value={customization.hero_description}
                  onChange={(e) => updateCustomization('hero_description', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                />
              </div>

              <div className="space-y-2 mt-4">
                <Label>URLs dos Banners</Label>
                <div className="space-y-2">
                  {customization.hero_banner_urls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={url}
                        onChange={(e) => updateBannerUrl(index, e.target.value)}
                        placeholder="https://exemplo.com/imagem.jpg"
                        disabled={isLocked}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeBannerUrl(index)}
                        disabled={isLocked}
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    onClick={addBannerUrl}
                    disabled={isLocked}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Adicionar Banner
                  </Button>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Label>Posição do Conteúdo</Label>
                <Select 
                  value={customization.hero_content_position} 
                  onValueChange={(value) => updateCustomization('hero_content_position', value)}
                  disabled={isLocked}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="absolute">Sobre a Imagem (Absolute)</SelectItem>
                    <SelectItem value="below">Abaixo da Imagem</SelectItem>
                    <SelectItem value="above">Acima da Imagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="buttons" className="space-y-4 pt-4">
            <ButtonSettings 
              label="Personalização de Botões"
              config={customization.buttons || {}}
              onChange={(val) => updateCustomization('buttons', val)}
              disabled={isLocked}
            />
          </TabsContent>

          <TabsContent value="cards" className="space-y-4 pt-4">
            <CardSettings 
              label="Configurações dos Cards"
              config={customization.cards || {}}
              onChange={(val) => updateCustomization('cards', val)}
              disabled={isLocked}
            />

            <div className="mt-8 border-t pt-8">
              <h4 className="text-sm font-bold uppercase tracking-wider mb-4 opacity-70">Estrutura dos Cards</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Layout dos Cards</Label>
                  <Select 
                    value={customization.cards_layout} 
                    onValueChange={(value) => updateCustomization('cards_layout', value)}
                    disabled={isLocked}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vertical">Vertical</SelectItem>
                      <SelectItem value="horizontal">Horizontal (com imagem)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="space-y-0.5">
                  <Label>Mostrar Imagens nos Cards</Label>
                  <p className="text-sm text-muted-foreground">
                    Permite adicionar imagens aos cards de serviços
                  </p>
                </div>
                <Switch
                  checked={customization.cards_show_images}
                  onCheckedChange={(checked) => updateCustomization('cards_show_images', checked)}
                  disabled={isLocked}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="footer" className="space-y-4 pt-4">
            <FooterSettings 
              config={customization.footer || {}}
              onChange={(val) => updateCustomization('footer', val)}
              disabled={isLocked}
            />
          </TabsContent>

          <TabsContent value="extra" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Habilitar Seção Extra</Label>
                <p className="text-sm text-muted-foreground">
                  Adiciona uma seção personalizada abaixo do hero
                </p>
              </div>
              <Switch
                checked={customization.extra_section_enabled}
                onCheckedChange={(checked) => updateCustomization('extra_section_enabled', checked)}
                disabled={isLocked}
              />
            </div>

            {customization.extra_section_enabled && (
              <CodeEditor
                code={customization.extra_section_code}
                onChange={(code) => updateCustomization('extra_section_code', code)}
                onSave={saveCustomization}
              />
            )}
          </TabsContent>

          <TabsContent value="footer" className="space-y-4">
            <div className="space-y-2">
              <Label>Fonte do Footer</Label>
              <Select 
                value={customization.footer_font_family} 
                onValueChange={(value) => updateCustomization('footer_font_family', value)}
                disabled={isLocked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontOptions.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ColorPicker
              type={customization.footer_background_type as "solid" | "gradient"}
              solidColor={customization.footer_background_color}
              gradientSettings={customization.footer_background_gradient}
              onTypeChange={(type) => updateCustomization('footer_background_type', type)}
              onSolidColorChange={(color) => updateCustomization('footer_background_color', color)}
              onGradientChange={(gradient) => updateCustomization('footer_background_gradient', gradient)}
              label="Fundo do Footer"
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}