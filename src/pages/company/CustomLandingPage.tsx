import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MapPin, Phone, Mail, Menu, LogInIcon, UserPlus2, ChevronDown, DoorClosedIcon, X, ChevronRight, TimerIcon, User } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";
import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Divide as Hamburger } from 'hamburger-react';
import { CampaignTopBar, CampaignPopup, CampaignHeroBanner } from "@/components/marketing/CampaignSlots";
import { useActiveCampaigns, type CampaignWithMaterials } from "@/hooks/use-active-campaigns";
import { trackCampaignClick, type PlacementCTA } from "@/lib/api/marketing";
import { getTypographyStyles, getBackgroundStyles, getButtonStyles, getCardStyles } from "@/components/business/personalization/utils";
import { type CustomizationData } from "@/components/business/personalization/types";

interface Combo {
  id: string;
  name: string;
  description?: string;
  price?: number;
  combo_price?: number;
  original_total_price?: number;
  total_duration_minutes?: number;
  is_active?: boolean;
  image_url?: string;
  items?: { service_id: string; service?: { id?: string; name?: string; price?: number; image_url?: string } }[];
}

export default function CustomLandingPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeServices, setEmployeeServices] = useState<any[]>([]);
  const [customization, setCustomization] = useState<CustomizationData | any>(null);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [businessHours, setBusinessHours] = useState<any[]>([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [optionHeader, setOptionHeader] = useState(false);
  const [visibleServices, setVisibleServices] = useState(4);
  const [visibleEmployees, setVisibleEmployees] = useState(4);
  const [loggedClient, setLoggedClient] = useState<{ id: string; name: string; avatar_url?: string | null } | null>(null);

  const { campaigns: heroCarouselCampaigns } = useActiveCampaigns(company?.id, "hero_carousel");
  type HeroBannerItem = { url: string; campaign?: CampaignWithMaterials; cfg?: PlacementCTA };
  const campaignHeroItems: HeroBannerItem[] = heroCarouselCampaigns.flatMap((c) => {
    const cfg = (c.placement_config?.["hero_carousel"] ?? {}) as PlacementCTA;
    return c.materials
      .filter((m) => !!m.file_url)
      .map((m) => ({ url: m.file_url as string, campaign: c, cfg }));
  });
  const customBannerItems: HeroBannerItem[] = ((customization?.hero?.banner_urls as string[] | undefined) ?? []).map((url) => ({ url }));
  const heroBannerItems: HeroBannerItem[] = [...customBannerItems, ...campaignHeroItems];
  const heroBannerUrls = heroBannerItems.map((i) => i.url);

  const handleHeroBannerClick = (item: HeroBannerItem) => {
    if (!item.campaign || !item.cfg) return;
    const cfg = item.cfg;
    if (cfg.buttonPosition !== "full") return;
    const href = cfg.url;
    if (!href) return;
    trackCampaignClick({ campaignId: item.campaign.id, companyId: item.campaign.company_id, placement: "hero_carousel", url: href });
    if (href.startsWith("/")) window.location.href = href;
    else window.open(href, "_blank", "noopener,noreferrer");
  };

  const handleHeroCtaClick = (item: HeroBannerItem) => {
    if (!item.campaign || !item.cfg?.url) return;
    const href = item.cfg.url;
    trackCampaignClick({ campaignId: item.campaign.id, companyId: item.campaign.company_id, placement: "hero_carousel", url: href });
    if (href.startsWith("/")) window.location.href = href;
    else window.open(href, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (slug) fetchData();
  }, [slug]);

  useEffect(() => {
    let active = true;
    const loadClient = async (companyId?: string) => {
      const { data: userData } = await supabaseClient.auth.getUser();
      if (!userData?.user || !companyId) { if (active) setLoggedClient(null); return; }
      const { data: c } = await supabaseClient
        .from('clients')
        .select('id, name, avatar_url')
        .eq('user_id', userData.user.id)
        .eq('company_id', companyId)
        .maybeSingle();
      if (active) setLoggedClient(c || null);
    };
    if (company?.id) loadClient(company.id);
    const { data: sub } = supabaseClient.auth.onAuthStateChange(() => {
      if (company?.id) loadClient(company.id);
    });
    return () => { active = false; sub?.subscription?.unsubscribe(); };
  }, [company?.id]);

  const handleClientLogout = async () => {
    await supabaseClient.auth.signOut();
    setLoggedClient(null);
  };

  const fetchData = async () => {
    try {
      const { data: companyData, error: companyError } = await supabaseClient
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .single();

      if (companyError || !companyData) {
        setLoading(false);
        return;
      }
      setCompany(companyData);

      const { data: servicesData } = await supabaseClient
        .from('services')
        .select('*')
        .eq('company_id', companyData.id)
        .eq('is_active', true);
      setServices(servicesData || []);

      const { data: combosData } = await supabaseClient
        .from('service_combos')
        .select('*, items:service_combo_items(*)')
        .eq('company_id', companyData.id)
        .eq('is_active', true)
        .order('name');
      
      if (combosData) {
        const serviceIds = Array.from(new Set(combosData.flatMap((c: any) => (c.items || []).map((it: any) => it.service_id)).filter(Boolean)));
        let servicesMap: Record<string, any> = {};
        if (serviceIds.length > 0) {
          const { data: servicesList } = await supabaseClient.from('services').select('id, name, price, image_url').in('id', serviceIds);
          servicesMap = (servicesList || []).reduce((acc: any, s: any) => ({ ...acc, [s.id]: s }), {});
        }
        setCombos(combosData.map((c: any) => ({ ...c, items: (c.items || []).map((it: any) => ({ ...it, service: servicesMap[it.service_id] || null })) })));
      }

      const { data: employeesData } = await supabaseClient.from('employees').select('*').eq('company_id', companyData.id).eq('is_active', true);
      setEmployees(employeesData || []);

      if (employeesData && employeesData.length > 0) {
        const { data: employeeServicesData } = await supabaseClient.from('employee_services').select('employee_id, service_id, services(id, name)').in('employee_id', employeesData.map(emp => emp.id));
        setEmployeeServices(employeeServicesData || []);
      }

      const { data: customizationData } = await supabaseClient.from('company_customizations').select('*').eq('company_id', companyData.id).maybeSingle();
      if (customizationData) {
        setCustomization({ ...customizationData, ...(customizationData.theme || {}) });
      }

      const { data: hoursData } = await supabaseClient.from('business_hours').select('*').eq('company_id', companyData.id).order('day_of_week');
      setBusinessHours(hoursData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const nextBanner = () => { if (heroBannerUrls.length > 1) setBannerIndex((prev) => (prev + 1) % heroBannerUrls.length); };
  const prevBanner = () => { if (heroBannerUrls.length > 1) setBannerIndex((prev) => (prev - 1 + heroBannerUrls.length) % heroBannerUrls.length); };

  const getLogoUrl = () => {
    if (!customization) return null;
    if (customization.logo_type === 'upload' && customization.logo_upload_path) {
      return supabaseClient.storage.from('company-logos').getPublicUrl(customization.logo_upload_path).data.publicUrl;
    }
    return customization.logo_url || null;
  };

  const getEmployeeServices = (employeeId: string) => employeeServices.filter(es => es.employee_id === employeeId).map(es => es.services?.name).filter(Boolean);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Carregando...</div>;
  if (!company) return <div className="min-h-screen bg-black flex items-center justify-center text-white"><h1>Empresa não encontrada</h1></div>;

  const bodyStyles = getBackgroundStyles(customization?.body);
  const headerStyles = { ...getBackgroundStyles(customization?.header), ...getTypographyStyles(customization?.header?.menu_typography) };
  const heroStyles = getBackgroundStyles(customization?.hero);
  const servicesStyles = getBackgroundStyles(customization?.services);
  const professionalsStyles = getBackgroundStyles(customization?.professionals);
  const aboutStyles = getBackgroundStyles(customization?.about);
  const footerStyles = { ...getBackgroundStyles(customization?.footer), ...getTypographyStyles(customization?.footer?.typography) };

  return (
    <div className="min-h-screen" style={{ ...bodyStyles, fontFamily: customization?.body?.font_family }}>
      {customization?.header?.position !== 'fixed' && <CampaignTopBar companyId={company?.id} />}
      <CampaignPopup companyId={company?.id} />

      {/* Header */}
      <header style={headerStyles} className={`${customization?.header?.position === 'fixed' ? 'sticky top-0 z-50' : 'relative'} backdrop-blur-sm p-4`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate(`/${slug}`)}>
            {getLogoUrl() ? <img src={getLogoUrl()!} alt={company.name} className="w-8 h-8 object-contain" /> : <BookingLogo showText={false} />}
            <h1 className="text-xl font-bold">{company.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            {loggedClient ? (
              <Button variant="ghost" size="sm" onClick={() => navigate(`/${slug}/client/dashboard`)}>Painel</Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/${slug}/entrar`)}>Entrar</Button>
                <Button size="sm" onClick={() => navigate(`/${slug}/cadastro`)} style={getButtonStyles(customization?.header?.buttons)}>Cadastrar</Button>
              </>
            )}
            <Hamburger size={20} toggled={optionHeader} toggle={setOptionHeader} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <CampaignHeroBanner companyId={company?.id} />
        
        {/* Hero */}
        {customization?.hero?.show !== false && (
          <section style={heroStyles} className="relative py-20 px-4 text-center">
            <div className="max-w-3xl mx-auto">
              <h1 style={getTypographyStyles(customization?.hero?.title_typography)} className="text-4xl md:text-6xl font-bold mb-6">
                {customization?.hero?.title_typography?.text || 'Seja Bem-vindo'}
              </h1>
              <p style={getTypographyStyles(customization?.hero?.description_typography)} className="text-lg md:text-xl mb-8">
                {customization?.hero?.description_typography?.text || 'Encontre os melhores serviços aqui.'}
              </p>
            </div>
          </section>
        )}

        {/* Serviços */}
        <section style={servicesStyles} className="py-20 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <h2 style={getTypographyStyles(customization?.services?.title_typography)} className="text-3xl font-bold mb-12">
              {customization?.services?.title_typography?.text || 'Serviços'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {services.slice(0, visibleServices).map(service => (
                <div key={service.id} style={getCardStyles(customization?.services?.cards)} className="p-6 bg-card rounded-xl">
                  {service.image_url && <img src={service.image_url} alt={service.name} className="w-full h-48 object-cover rounded-lg mb-4" />}
                  <h3 style={getTypographyStyles(customization?.services?.cards?.title_typography)} className="text-xl font-bold mb-2">{service.name}</h3>
                  <p style={getTypographyStyles(customization?.services?.cards?.description_typography)} className="text-muted-foreground mb-4">{service.description}</p>
                  <div className="flex justify-between items-center mt-4">
                    <span style={getTypographyStyles(customization?.services?.cards?.price_typography)} className="text-xl font-bold">R$ {Number(service.price).toFixed(2)}</span>
                    <Button size="sm" onClick={() => navigate(`/${slug}/agendar`)} style={getButtonStyles(customization?.services?.buttons)}>Agendar</Button>
                  </div>
                </div>
              ))}
            </div>
            {visibleServices < services.length && <Button variant="outline" className="mt-8" onClick={() => setVisibleServices(v => v + 3)}>Ver mais</Button>}
            
            <div className="mt-16 text-center">
              <Button 
                size="lg" 
                onClick={() => navigate(`/${slug}/agendar`)} 
                style={getButtonStyles(customization?.hero?.buttons)}
                className="px-8 py-6 text-lg"
              >
                {customization?.hero?.buttons?.typography?.text || 'Agendar Agora'}
              </Button>
            </div>
          </div>
        </section>

        {/* Profissionais */}
        <section style={professionalsStyles} className="py-20 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <h2 style={getTypographyStyles(customization?.professionals?.title_typography)} className="text-3xl font-bold mb-12">
              {customization?.professionals?.title_typography?.text || 'Nossa Equipe'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {employees.slice(0, visibleEmployees).map(emp => (
                <div key={emp.id} style={getCardStyles(customization?.professionals?.cards)} className="p-6 bg-card rounded-xl text-center">
                  <div className="w-24 h-24 mx-auto rounded-full bg-muted mb-4 overflow-hidden">
                    {emp.avatar_url ? <img src={emp.avatar_url} alt={emp.name} className="w-full h-full object-cover" /> : <User className="w-full h-full p-6 text-muted-foreground" />}
                  </div>
                  <h3 style={getTypographyStyles(customization?.professionals?.cards?.title_typography)} className="text-xl font-bold mb-2">{emp.name}</h3>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {getEmployeeServices(emp.id).map((s, i) => <Badge key={i} variant="secondary">{s}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sobre */}
        <section style={aboutStyles} className="py-20 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 style={getTypographyStyles(customization?.about?.title_typography)} className="text-3xl font-bold mb-6">
              {customization?.about?.title_typography?.text || 'Sobre Nós'}
            </h2>
            <p className="text-lg text-muted-foreground">{company.description || 'Uma empresa dedicada à excelência.'}</p>
          </div>
        </section>

        {/* Custom Code */}
        {customization?.extra?.custom_css && <style>{customization.extra.custom_css}</style>}
      </main>

      {/* Footer */}
      <footer style={footerStyles} className="py-12 px-4 border-t">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-bold mb-4">{company.name}</h3>
            <p className="text-sm opacity-70">{company.address || 'Endereço não informado'}</p>
          </div>
          <div>
            <h4 className="font-bold mb-4">Contato</h4>
            <div className="space-y-2 text-sm opacity-70">
              <p className="flex items-center gap-2"><Phone className="w-4 h-4" /> {company.phone}</p>
              <p className="flex items-center gap-2"><Mail className="w-4 h-4" /> {company.email}</p>
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-4">Redes Sociais</h4>
            <div className="flex gap-4">
              {/* Social Icons Placeholder */}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t text-center text-xs opacity-50">
          © {new Date().getFullYear()} {company.name}. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
