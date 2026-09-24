import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Briefcase,
  Settings,
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
  User,
  UserRoundCog,
  BarChart3,
  Wallet,
  LogOut,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { BookingLogo } from "@/components/BookingLogo";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useSidebarBadges, type BadgeInfo } from "@/hooks/use-sidebar-badges";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type PermissionCode = string;
type SubItem = { title: string; url: string; icon: typeof LayoutDashboard; permission?: PermissionCode };
type MenuItem = { title: string; url: string; icon: typeof LayoutDashboard; permission?: PermissionCode; children?: SubItem[] };

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { title: "Agendamentos", url: "/admin/agendamentos", icon: Calendar, permission: "bookings.view" },
  { title: "Clientes", url: "/admin/clientes", icon: Users, permission: "clients.view" },
  { title: "Realocação", url: "/admin/realocacao", icon: ArrowRightLeft, permission: "reallocation.view" },
  { title: "Ausências", url: "/admin/ausencias", icon: CalendarOff, permission: "employees.view" },
  { title: "Horários", url: "/admin/horarios", icon: Clock, permission: "employees.view" },
  { title: "Serviços", url: "/admin/servicos", icon: Briefcase, permission: "services.view" },
  { title: "Colaboradores", url: "/admin/colaboradores", icon: Users, permission: "employees.view" },
  { title: "Recursos Humanos", url: "/admin/recursos-humanos", icon: UserRoundCog, permission: "hr.view" },
  { title: "Solicitações", url: "/admin/solicitacoes", icon: Inbox, permission: "reallocation.view" },
  { title: "Notificações", url: "/admin/notificacoes", icon: Bell, permission: "dashboard.view" },
  { title: "Bate-papo", url: "/admin/bate-papo", icon: MessageSquare, permission: "chat.view" },
  { title: "Marketing", url: "/admin/marketing", icon: Megaphone, permission: "marketing.view" },
  {
    title: "Automações",
    url: "/admin/automacoes/disparos",
    icon: Zap,
    permission: "chatbot.view",
    children: [
      { title: "Chatbot - Zailom Flow", url: "/admin/automacoes/chatbot/zailom-flow", icon: Bot, permission: "chatbot.view" },
      { title: "Disparos WhatsApp", url: "/admin/automacoes/disparos", icon: Send, permission: "whatsapp.manage" },
      { title: "E-mail Marketing", url: "/admin/automacoes/email-marketing", icon: Mail, permission: "marketing.view" },
      { title: "Gatilhos / Agenda", url: "/admin/automacoes/gatilhos", icon: CalendarClock, permission: "bookings.view" },
    ],
  },
  {
    title: "Integrações",
    url: "/admin/integracoes/whatsapp",
    icon: Plug2,
    permission: "whatsapp.view",
    children: [
      { title: "Chatbot", url: "/admin/integracao/chatbot", icon: Plug, permission: "chatbot.view" },
      { title: "WhatsApp", url: "/admin/integracoes/whatsapp", icon: Smartphone, permission: "whatsapp.view" },
      { title: "E-mail", url: "/admin/integracoes/email", icon: Mail, permission: "settings.view" },
      { title: "API REST", url: "/admin/integracoes/api", icon: KeyRound, permission: "settings.view" },
    ],
  },
  { title: "Relatórios", url: "/admin/relatorios", icon: BarChart3, permission: "reports.view_basic" },
  { title: "Financeiro", url: "/admin/financeiro", icon: Wallet, permission: "finance.view" },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings, permission: "settings.view" },
];

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
  const [resolvedUser, setResolvedUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    if (currentUser !== undefined) {
      setResolvedUser(currentUser);
      return;
    }

    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setResolvedUser(data.user ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const sidebarUser = currentUser !== undefined ? currentUser : resolvedUser;
  const { hasPermission, permissionCodes, loading: permissionsLoading, userRole: permissionUserRole } = usePermissions(companyId, sidebarUser);

  const effectiveUserRole =
    userRole === 'owner' || userRole === 'admin'
      ? userRole
      : permissionUserRole || userRole;

  const currentPath = location.pathname;
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const basePath = `/${routeSlug || companySlug}`;

  const isActive = (path: string) => {
    const full = `${basePath}${path}`;
    return currentPath === full || currentPath.startsWith(`${full}/`);
  };

  const getNavCls = (active: boolean) =>
    active
      ? "!bg-primary/20 !text-primary border-l-4 !border-l-primary font-semibold shadow-[inset_0_0_12px_rgba(0,200,255,0.08)]"
      : "border-l-4 border-l-transparent hover:bg-primary/10 hover:text-primary";

  const badges = useSidebarBadges(companyId, sidebarUser?.id);
  const renderBadge = (info?: BadgeInfo) => {
    if (!info || info.count <= 0) return null;
    const color = info.severity === "red" ? "bg-destructive text-destructive-foreground" : "bg-yellow-500 text-black";
    return (
      <span className={cn("ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center", color)}>
        {info.count > 99 ? "99+" : info.count}
      </span>
    );
  };

  const collapsedBadgeDot = (info?: BadgeInfo) => {
    if (!info || info.count <= 0) return null;
    const color = info.severity === "red" ? "bg-destructive" : "bg-yellow-500";
    return <span className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card", color)} />;
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

  const canAccessPermission = (permission?: PermissionCode) => {
    if (!permission) return false;
    if (effectiveUserRole === 'owner' || effectiveUserRole === 'admin') return true;

    // Configurações permanece visível enquanto houver qualquer
    // permissão ativa do módulo settings, independentemente do tipo.
    if (permission === 'settings.view') {
      return Array.from(permissionCodes).some((code) => code.startsWith('settings.'));
    }

    return hasPermission(permission);
  };

  const allowedMenuItems = permissionsLoading && effectiveUserRole !== 'owner' && effectiveUserRole !== 'admin'
    ? []
    : menuItems
        .map((item) => {
          if (!item.children) return canAccessPermission(item.permission) ? item : null;
          const allowedChildren = item.children.filter((child) => canAccessPermission(child.permission));
          if (allowedChildren.length === 0) return null;
          return { ...item, children: allowedChildren };
        })
        .filter((item): item is MenuItem => item !== null);

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20 h-screen sticky top-0 transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]">
      <SidebarContent className="bg-card/30 backdrop-blur-sm border-r border-primary/20 min-h-0 overflow-hidden flex flex-col transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]">
        <div className="p-4 border-b border-primary/20 flex flex-col items-center justify-center min-h-[100px] shrink-0">
          {state !== "collapsed" ? (
            <div className="w-full transition-all duration-500 opacity-100 scale-100">
              <BookingLogo showText={false} className="mb-2" />
              <h2 className="font-semibold text-gradient truncate">{companyName}</h2>
              <p className="text-sm text-muted-foreground capitalize">{effectiveUserRole}</p>
            </div>
          ) : (
            <div className="flex justify-center transition-all duration-500 opacity-100 scale-110"><BookingLogo showText={false} /></div>
          )}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 scrollbar-none">
          <SidebarGroup>
            <SidebarGroupLabel className={state === "collapsed" ? "sr-only" : "transition-opacity duration-500"}>Menu Principal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={state === "collapsed" ? "flex flex-col items-center" : ""}>
                {allowedMenuItems.map((item) => {
                  const parentBadge = badges[item.title];
                  if (item.children && item.children.length > 0) {
                    const childActive = item.children.some((c) => isActive(c.url));
                    const collapsed = state === "collapsed";
                    const childrenBadgeTotal = item.children.reduce((sum, c) => sum + (badges[c.title]?.count ?? 0), parentBadge?.count ?? 0);
                    const childrenWorstSev = item.children.some((c) => badges[c.title]?.severity === "red") || parentBadge?.severity === "red" ? "red" : "yellow";
                    const groupBadge: BadgeInfo | undefined = childrenBadgeTotal > 0 ? { count: childrenBadgeTotal, severity: childrenWorstSev as "red" | "yellow" } : undefined;
                    return (
                      <Collapsible key={item.title} defaultOpen={childActive} className="w-full">
                        <SidebarMenuItem className={collapsed ? "flex justify-center w-full" : ""}>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton isActive={childActive} className={cn("relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300", collapsed ? "justify-center w-10 h-10 p-0" : "w-full", getNavCls(childActive))}>
                              <span className="relative"><item.icon className="w-5 h-5 flex-shrink-0" />{collapsed && collapsedBadgeDot(groupBadge)}</span>
                              {!collapsed && <><span className="flex-1 text-left transition-opacity duration-500">{item.title}</span>{renderBadge(groupBadge)}<ChevronDown className="w-4 h-4 ml-1 transition-transform duration-300 data-[state=open]:rotate-180" /></>}
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          {!collapsed && (
                            <CollapsibleContent className="w-full">
                              <div className="ml-6 mt-1 flex flex-col gap-1 border-l border-primary/20 pl-2">
                                {item.children.map((child) => {
                                  const childBadge = badges[child.title];
                                  return (
                                    <NavLink key={child.title} to={`${basePath}${child.url}`} className={({ isActive: navActive }) => `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${getNavCls(navActive || isActive(child.url))}`}>
                                      <child.icon className="w-4 h-4" /><span className="flex-1">{child.title}</span>{renderBadge(childBadge)}
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
                      <SidebarMenuButton asChild isActive={itemActive} className={cn("relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300", state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full", getNavCls(itemActive))}>
                        <NavLink to={`${basePath}${item.url}`}>
                          <span className="relative"><item.icon className="w-5 h-5 flex-shrink-0" />{state === "collapsed" && collapsedBadgeDot(parentBadge)}</span>
                          {state !== "collapsed" && <><span className="flex-1 transition-opacity duration-500">{item.title}</span>{renderBadge(parentBadge)}</>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>

        <div className="shrink-0 border-t border-primary/20 pt-2 pb-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem className={state === "collapsed" ? "flex justify-center w-full" : ""}>
                  <SidebarMenuButton asChild isActive={isActive("/admin/perfil")} className={cn("relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300", state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full", getNavCls(isActive("/admin/perfil")))}>
                    <NavLink to={`${basePath}/admin/perfil`}>
                      <User className="w-5 h-5 flex-shrink-0" />
                      {state !== "collapsed" && <span className="flex-1">Meu Perfil</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className={state === "collapsed" ? "flex justify-center w-full" : ""}>
                  <SidebarMenuButton
                    type="button"
                    onClick={handleLogout}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 border-l-4 border-l-transparent hover:bg-destructive/10 hover:text-destructive",
                      state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full"
                    )}
                  >
                    <LogOut className="w-5 h-5 flex-shrink-0" />
                    {state !== "collapsed" && <span className="flex-1 text-left">Sair</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
