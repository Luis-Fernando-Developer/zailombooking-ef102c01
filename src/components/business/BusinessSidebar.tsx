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
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { User as SupabaseUser } from '@supabase/supabase-js';

type SubItem = { title: string; url: string; icon: typeof LayoutDashboard };
type MenuItem = { title: string; url: string; icon: typeof LayoutDashboard; children?: SubItem[] };

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Agendamentos", url: "/admin/agendamentos", icon: Calendar },
  { title: "Horários", url: "/admin/horarios", icon: Clock },
  { title: "Serviços", url: "/admin/servicos", icon: Briefcase },
  { title: "Colaboradores", url: "/admin/colaboradores", icon: Users },
  { title: "Solicitações", url: "/admin/solicitacoes", icon: Inbox },
  { title: "Notificações", url: "/admin/notificacoes", icon: Bell },
  { title: "Bate-papo", url: "/admin/bate-papo", icon: MessageSquare },
  {
    title: "Chatbot",
    url: "/admin/chatbot/integracao",
    icon: Bot,
    children: [
      { title: "Integração", url: "/admin/chatbot/integracao", icon: Plug },
      { title: "Zailom Flow", url: "/admin/chatbot/talkmap", icon: MessageSquare },
    ],
  },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

// Matriz única de permissões por role (fonte da verdade global)
// Usada também por outras superfícies (botões de ação) via getMenuAccess()
const ROLE_MENU_ACCESS: Record<string, string[]> = {
  owner:         ["Dashboard", "Agendamentos", "Horários", "Serviços", "Colaboradores", "Solicitações", "Notificações", "Bate-papo", "Chatbot", "Configurações"],
  manager:       ["Dashboard", "Agendamentos", "Horários", "Serviços", "Colaboradores", "Solicitações", "Notificações", "Bate-papo", "Chatbot", "Configurações"],
  supervisor:    ["Dashboard", "Agendamentos", "Horários", "Colaboradores", "Solicitações", "Notificações", "Bate-papo"],
  receptionist:  ["Dashboard", "Agendamentos", "Horários", "Solicitações", "Notificações", "Bate-papo"],
  employee:      ["Dashboard", "Agendamentos", "Horários", "Solicitações", "Notificações", "Bate-papo"],
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
  const basePath = `/${companySlug}`;

  const isActive = (path: string) => currentPath === `${basePath}${path}`;
  const getNavCls = (isActive: boolean) =>
    isActive
      ? "bg-primary/20 text-primary border-r-2 border-primary"
      : "hover:bg-primary/10 hover:text-primary";

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
                  if (item.children && item.children.length > 0) {
                    const childActive = item.children.some((c) => isActive(c.url));
                    const collapsed = state === "collapsed";
                    return (
                      <Collapsible key={item.title} defaultOpen={childActive} className="w-full">
                        <SidebarMenuItem className={collapsed ? "flex justify-center w-full" : ""}>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 ${
                                collapsed ? "justify-center w-10 h-10 p-0" : "w-full"
                              } ${
                                childActive ? "bg-primary/20 text-primary" : "hover:bg-primary/10 hover:text-primary"
                              }`}
                            >
                              <item.icon className={`w-5 h-5 flex-shrink-0 ${collapsed ? "m-0" : ""}`} />
                              {!collapsed && (
                                <>
                                  <span className="flex-1 text-left transition-opacity duration-500">{item.title}</span>
                                  <ChevronDown className="w-4 h-4 transition-transform duration-300 data-[state=open]:rotate-180" />
                                </>
                              )}
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          {!collapsed && (
                            <CollapsibleContent className="w-full">
                              <div className="ml-6 mt-1 flex flex-col gap-1 border-l border-primary/20 pl-2">
                                {item.children.map((child) => (
                                  <NavLink
                                    key={child.title}
                                    to={`${basePath}${child.url}`}
                                    className={({ isActive }) =>
                                      `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${getNavCls(isActive)}`
                                    }
                                  >
                                    <child.icon className="w-4 h-4" />
                                    <span>{child.title}</span>
                                  </NavLink>
                                ))}
                              </div>
                            </CollapsibleContent>
                          )}
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  }
                  return (
                    <SidebarMenuItem key={item.title} className={state === "collapsed" ? "flex justify-center w-full" : ""}>
                      <SidebarMenuButton asChild>
                        <NavLink 
                          to={`${basePath}${item.url}`} 
                          className={({ isActive }) => 
                            `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 ${
                              state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full"
                            } ${getNavCls(isActive)}`
                          }
                        >
                          <item.icon className={`w-5 h-5 flex-shrink-0 ${state === "collapsed" ? "m-0" : ""}`} />
                          {state !== "collapsed" && <span className="transition-opacity duration-500">{item.title}</span>}
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