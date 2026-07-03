import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { 
  LayoutDashboard,
  Calendar, 
  Users, 
  Briefcase, 
  Settings,
  User,
  LogOut,
  Bot,
  Clock,
  ChevronDown,
  Plug,
  MessageSquare,
  Inbox,
  Bell,
  Megaphone,
  Plug2,
  Mail,
  Smartphone,
  Zap,
  Send,
  CalendarClock,
  ArrowRightLeft,
  CalendarOff,

  KeyRound,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useSidebarBadges, type BadgeInfo } from "@/hooks/use-sidebar-badges";
import { cn } from "@/lib/utils";

type SubItem = { title: string; url: string; icon: typeof LayoutDashboard };
type MenuItem = { title: string; url: string; icon: typeof LayoutDashboard; children?: SubItem[] };

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Agendamentos", url: "/admin/agendamentos", icon: Calendar },
  { title: "Realocação", url: "/admin/realocacao", icon: ArrowRightLeft },
  { title: "Ausências", url: "/admin/ausencias", icon: CalendarOff },

  { title: "Horários", url: "/admin/horarios", icon: Clock },
  { title: "Serviços", url: "/admin/servicos", icon: Briefcase },
  { title: "Colaboradores", url: "/admin/colaboradores", icon: Users },
  { title: "Solicitações", url: "/admin/solicitacoes", icon: Inbox },
  { title: "Notificações", url: "/admin/notificacoes", icon: Bell },
  { title: "Bate-papo", url: "/admin/bate-papo", icon: MessageSquare },
  { title: "Marketing", url: "/admin/marketing", icon: Megaphone },
  {
    title: "Automações",
    url: "/admin/automacoes/disparos",
    icon: Zap,
    children: [
      { title: "Chatbot - Zailom Flow", url: "/admin/automacoes/chatbot/zailom-flow", icon: Bot },
      { title: "Disparos WhatsApp", url: "/admin/automacoes/disparos", icon: Send },
      { title: "E-mail Marketing", url: "/admin/automacoes/email-marketing", icon: Mail },
      { title: "Gatilhos / Agenda", url: "/admin/automacoes/gatilhos", icon: CalendarClock },
    ],
  },
  {
    title: "Integrações",
    url: "/admin/integracoes/whatsapp",
    icon: Plug2,
    children: [
      { title: "Chatbot", url: "/admin/integracao/chatbot", icon: Plug },
      { title: "WhatsApp", url: "/admin/integracoes/whatsapp", icon: Smartphone },
      { title: "E-mail", url: "/admin/integracoes/email", icon: Mail },
      { title: "API REST", url: "/admin/integracoes/api", icon: KeyRound },
    ],
  },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

// Matriz única de permissões por role (fonte da verdade global)
// Usada também por outras superfícies (botões de ação) via getMenuAccess()
const ROLE_MENU_ACCESS: Record<string, string[]> = {
  owner:         ["Dashboard", "Agendamentos", "Realocação", "Ausências", "Horários", "Serviços", "Colaboradores", "Solicitações", "Notificações", "Bate-papo", "Marketing", "Chatbot", "Automações", "Integrações", "Configurações"],
  manager:       ["Dashboard", "Agendamentos", "Realocação", "Ausências", "Horários", "Serviços", "Colaboradores", "Solicitações", "Notificações", "Bate-papo", "Marketing", "Chatbot", "Automações", "Integrações", "Configurações"],
  supervisor:    ["Dashboard", "Agendamentos", "Realocação", "Ausências", "Horários", "Colaboradores", "Solicitações", "Notificações", "Bate-papo"],
  receptionist:  ["Dashboard", "Agendamentos", "Horários", "Solicitações", "Notificações", "Bate-papo"],
  employee:      ["Dashboard", "Agendamentos", "Horários", "Solicitações", "Notificações", "Bate-papo"],
  rh:            ["Dashboard", "Notificações", "Bate-papo", "Marketing"],
  marketing:     ["Dashboard", "Notificações", "Bate-papo", "Marketing"],
  designer:      ["Dashboard", "Notificações", "Bate-papo", "Marketing"],
};

export function getAllowedMenusForRole(role: string): string[] {
  return ROLE_MENU_ACCESS[role] ?? ROLE_MENU_ACCESS.employee;
}

interface BusinessSidebarProps {
  companySlug: string;
  companyName: string;
  companyId?: string;
  userRole: string;
  currentUser?: SupabaseUser | null;
}

export function BusinessSidebar({ companySlug, companyName, companyId, userRole, currentUser }: BusinessSidebarProps) {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const currentPath = location.pathname;
  const { slug: routeSlug } = useParams<{ slug: string }>();
  // Prefer the slug from the URL (source of truth) — evita mismatch quando
  // company.slug do banco difere do slug da rota atual.
  const basePath = `/${routeSlug || companySlug}`;

  // Activo: match exato OU prefixo + "/" (cobre subpaths como /talkmap/123)
  const isActive = (path: string) => {
    const full = `${basePath}${path}`;
    return currentPath === full || currentPath.startsWith(`${full}/`);
  };
  const getNavCls = (active: boolean) =>
    active
      ? "!bg-primary/20 !text-primary border-l-4 !border-l-primary font-semibold shadow-[inset_0_0_12px_rgba(0,200,255,0.08)]"
      : "border-l-4 border-l-transparent hover:bg-primary/10 hover:text-primary";

  // Badges em tempo real (vermelho = ação imediata; amarelo = atenção/aprovação)
  const badges = useSidebarBadges(companyId, currentUser?.id);
  const renderBadge = (info?: BadgeInfo) => {
    if (!info || info.count <= 0) return null;
    const color =
      info.severity === "red"
        ? "bg-destructive text-destructive-foreground"
        : "bg-yellow-500 text-black";
    return (
      <span
        className={cn(
          "ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center",
          color,
        )}
      >
        {info.count > 99 ? "99+" : info.count}
      </span>
    );
  };
  const collapsedBadgeDot = (info?: BadgeInfo) => {
    if (!info || info.count <= 0) return null;
    const color = info.severity === "red" ? "bg-destructive" : "bg-yellow-500";
    return (
      <span
        className={cn(
          "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card",
          color,
        )}
      />
    );
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: "Logout realizado", description: "Até logo!" });
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Owner detection via owner_email (caso o owner não tenha registro em employees)
  const [isOwnerByCompany, setIsOwnerByCompany] = useState<boolean>(false);
  useEffect(() => {
    let isMounted = true;
    async function checkOwner() {
      if (!companyId || !currentUser?.email) return;
      const { data } = await supabase
        .from('companies')
        .select('owner_email')
        .eq('id', companyId)
        .single();
      const ownerEmail = (data?.owner_email || '').toLowerCase();
      const currentEmail = currentUser.email?.toLowerCase() || '';
      if (isMounted) setIsOwnerByCompany(!!ownerEmail && ownerEmail === currentEmail);
    }
    checkOwner();
    return () => { isMounted = false; };
  }, [companyId, currentUser?.email]);

  // Fonte da verdade: userRole vindo da página (já resolvido antes do mount).
  // Sem janela de "loading" que esconda/vaze itens — render é determinístico.
  const effectiveRole = isOwnerByCompany ? 'owner' : (userRole || 'employee');
  const allowed = new Set(getAllowedMenusForRole(effectiveRole));
  const filteredMenuItems = menuItems.filter(item => allowed.has(item.title));

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20 h-screen sticky top-0 transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]">
      <SidebarContent className="bg-card/30 backdrop-blur-sm border-r border-primary/20 min-h-0 overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]">
        {/* Header */}
        <div className="p-4 border-b border-primary/20 flex flex-col items-center justify-center min-h-[100px]">
          {state !== "collapsed" ? (
            <div className="w-full transition-all duration-500 opacity-100 scale-100">
              <BookingLogo showText={false} className="mb-2" />
              <h2 className="font-semibold text-gradient truncate">{companyName}</h2>
              <p className="text-sm text-muted-foreground capitalize">{userRole}</p>
            </div>
          ) : (
            <div className="flex justify-center transition-all duration-500 opacity-100 scale-110">
              <BookingLogo showText={false} />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="overflow-y-auto h-full scrollbar-none">

          <SidebarGroup>
            <SidebarGroupLabel className={state === "collapsed" ? "sr-only" : "transition-opacity duration-500"}>
              Menu Principal
            </SidebarGroupLabel>
            <SidebarGroupContent>
              
              <SidebarMenu className={state === "collapsed" ? "flex flex-col items-center" : ""}>
                {filteredMenuItems.map((item) => {
                  const parentBadge = badges[item.title];
                  if (item.children && item.children.length > 0) {
                    const childActive = item.children.some((c) => isActive(c.url));
                    const collapsed = state === "collapsed";
                    // Soma badges dos filhos para mostrar no topo do grupo (quando colapsado)
                    const childrenBadgeTotal = item.children.reduce(
                      (sum, c) => sum + (badges[c.title]?.count ?? 0),
                      parentBadge?.count ?? 0,
                    );
                    const childrenWorstSev =
                      item.children.some((c) => badges[c.title]?.severity === "red") ||
                      parentBadge?.severity === "red"
                        ? "red"
                        : "yellow";
                    const groupBadge: BadgeInfo | undefined =
                      childrenBadgeTotal > 0
                        ? { count: childrenBadgeTotal, severity: childrenWorstSev as "red" | "yellow" }
                        : undefined;
                    return (
                      <Collapsible key={item.title} defaultOpen={childActive} className="w-full">
                        <SidebarMenuItem className={collapsed ? "flex justify-center w-full" : ""}>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              isActive={childActive}
                              className={cn(
                                "relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300",
                                collapsed ? "justify-center w-10 h-10 p-0" : "w-full",
                                getNavCls(childActive),
                              )}
                            >
                              <span className="relative">
                                <item.icon className={`w-5 h-5 flex-shrink-0 ${collapsed ? "m-0" : ""}`} />
                                {collapsed && collapsedBadgeDot(groupBadge)}
                              </span>
                              {!collapsed && (
                                <>
                                  <span className="flex-1 text-left transition-opacity duration-500">{item.title}</span>
                                  {renderBadge(groupBadge)}
                                  <ChevronDown className="w-4 h-4 ml-1 transition-transform duration-300 data-[state=open]:rotate-180" />
                                </>
                              )}
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          {!collapsed && (
                            <CollapsibleContent className="w-full">
                              <div className="ml-6 mt-1 flex flex-col gap-1 border-l border-primary/20 pl-2">
                                {item.children.map((child) => {
                                  const childBadge = badges[child.title];
                                  return (
                                    <NavLink
                                      key={child.title}
                                      to={`${basePath}${child.url}`}
                                      className={({ isActive: navActive }) =>
                                        `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${getNavCls(navActive || isActive(child.url))}`
                                      }
                                    >
                                      <child.icon className="w-4 h-4" />
                                      <span className="flex-1">{child.title}</span>
                                      {renderBadge(childBadge)}
                                    </NavLink>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          )}
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  }
                  const itemActive = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title} className={state === "collapsed" ? "flex justify-center w-full" : ""}>
                      <SidebarMenuButton
                        asChild
                        isActive={itemActive}
                        className={cn(
                          "relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300",
                          state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full",
                          getNavCls(itemActive),
                        )}
                      >
                        <NavLink
                          to={`${basePath}${item.url}`}
                        >
                          <span className="relative">
                            <item.icon className={`w-5 h-5 flex-shrink-0 ${state === "collapsed" ? "m-0" : ""}`} />
                            {state === "collapsed" && collapsedBadgeDot(parentBadge)}
                          </span>
                          {state !== "collapsed" && (
                            <>
                              <span className="flex-1 transition-opacity duration-500">{item.title}</span>
                              {renderBadge(parentBadge)}
                            </>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* User Actions */}
          <div className="mt-auto p-4 border-t border-primary/20">
            <div className="space-y-2 flex flex-col items-center">
              <SidebarMenuButton asChild>
                <NavLink 
                  to={`${basePath}/admin/perfil`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 ${
                    state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full"
                  } hover:bg-primary/10`}
                >
                  <User className={`w-5 h-5 ${state === "collapsed" ? "m-0" : ""}`} />
                  {state !== "collapsed" && <span className="transition-opacity duration-500">Meu Perfil</span>}
                </NavLink>
              </SidebarMenuButton>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className={`flex items-center gap-3 px-3 transition-all duration-300 ${
                  state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full justify-start"
                } hover:bg-destructive/10 hover:text-destructive`}
              >
                <LogOut className={`w-5 h-5 ${state === "collapsed" ? "m-0" : ""}`} />
                {state !== "collapsed" && <span className="transition-opacity duration-500">Sair</span>}
              </Button>
            </div>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}