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
  MessageSquare
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { User as SupabaseUser } from '@supabase/supabase-js';

type SubItem = { title: string; url: string; icon: typeof LayoutDashboard };
type MenuItem = { title: string; url: string; icon: typeof LayoutDashboard; children?: SubItem[] };

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Agendamentos", url: "/admin/agendamentos", icon: Calendar },
  { title: "Horários", url: "/admin/horarios", icon: Clock },
  { title: "Serviços", url: "/admin/servicos", icon: Briefcase },
  { title: "Colaboradores", url: "/admin/colaboradores", icon: Users },
  {
    title: "Chatbot",
    url: "/admin/chatbot/integracao",
    icon: Bot,
    children: [
      { title: "Integração", url: "/admin/chatbot/integracao", icon: Plug },
      { title: "TalkMap", url: "/admin/chatbot/talkmap", icon: MessageSquare },
    ],
  },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

interface BusinessSidebarProps {
  companySlug: string;
  companyName: string;
  companyId: string;
  userRole: string;
  currentUser?: SupabaseUser | null;
}

export function BusinessSidebar({ companySlug, companyName, companyId, userRole, currentUser }: BusinessSidebarProps) {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { permissions, loading, userRole: resolvedRole } = usePermissions(companyId, currentUser);

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
      toast({
        title: "Logout realizado",
        description: "Até logo!",
      });
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Detecta se o usuário logado é o proprietário da empresa (sem depender de is_active)
  const [isOwnerByCompany, setIsOwnerByCompany] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function checkOwner() {
      try {
        if (!companyId || !currentUser?.email) {
          if (isMounted) setIsOwnerByCompany(false);
          return;
        }
        const { data, error } = await supabase
          .from('companies')
          .select('owner_email')
          .eq('id', companyId)
          .single();
        if (error) {
          if (isMounted) setIsOwnerByCompany(false);
          return;
        }
        const ownerEmail = (data?.owner_email || '').toLowerCase();
        const currentEmail = currentUser.email?.toLowerCase() || '';
        if (isMounted) setIsOwnerByCompany(!!ownerEmail && ownerEmail === currentEmail);
      } catch {
        if (isMounted) setIsOwnerByCompany(false);
      }
    }
    checkOwner();
    return () => { isMounted = false; };
  }, [companyId, currentUser?.email]);

  // Filtrar itens do menu baseado nas permissões
  const filteredMenuItems = menuItems.filter(item => {
    const role = userRole === 'owner' ? 'owner' : (resolvedRole ?? userRole);
    const ownerOverride = role === 'owner' || isOwnerByCompany === true;

    // Owner (por propriedade da empresa) sempre vê todos os itens
    if (ownerOverride) {
      return true;
    }

    // Enquanto carregando OU sem role/permissões resolvidas, mostrar tudo (evita sumir no primeiro render)
    if (loading || !resolvedRole || !permissions) {
      return true;
    }

    // Priorizar permissões quando disponíveis e não estiver carregando
    if (permissions) {
      switch (item.title) {
        case "Colaboradores":
          return permissions.canViewEmployees;
        case "Configurações":
          return permissions.canManageSettings;
        default:
          return true;
      }
    }

    // Fallback por role
    switch (item.title) {
      case "Colaboradores":
        return ['owner', 'manager', 'supervisor'].includes(role);
      case "Configurações":
        return ['owner', 'manager'].includes(role);
      default:
        return true;
    }
  });

  return (
    <Sidebar className={state === "collapsed" ? "w-14 " : "w-64  h-screen top-0"} >
      <SidebarContent className="bg-card/30 backdrop-blur-sm border-r border-primary/20  min-h-dvh overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-primary/20">
          {state !== "collapsed" ? (
            <div>
              <BookingLogo showText={true} className="mb-2" />
              <h2 className="font-semibold text-gradient truncate">{companyName}</h2>
              <p className="text-sm text-muted-foreground capitalize">{userRole}</p>
            </div>
          ) : (
            <div className="flex justify-center">
              <BookingLogo showText={false} />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="overflow-y-auto h-full">

          <SidebarGroup>
            <SidebarGroupLabel className={state === "collapsed" ? "sr-only" : ""}>
              Menu Principal
            </SidebarGroupLabel>
            <SidebarGroupContent>
              
              <SidebarMenu>
                {filteredMenuItems.map((item) => {
                  if (item.children && item.children.length > 0) {
                    const childActive = item.children.some((c) => isActive(c.url));
                    const collapsed = state === "collapsed";
                    return (
                      <Collapsible key={item.title} defaultOpen={childActive}>
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full ${
                                childActive ? "bg-primary/20 text-primary" : "hover:bg-primary/10 hover:text-primary"
                              }`}
                            >
                              <item.icon className="w-5 h-5 flex-shrink-0" />
                              {!collapsed && (
                                <>
                                  <span className="flex-1 text-left">{item.title}</span>
                                  <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                                </>
                              )}
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          {!collapsed && (
                            <CollapsibleContent>
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
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink 
                          to={`${basePath}${item.url}`} 
                          className={({ isActive }) => 
                            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${getNavCls(isActive)}`
                          }
                        >
                          <item.icon className="w-5 h-5 flex-shrink-0" />
                          {state !== "collapsed" && <span>{item.title}</span>}
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
            <div className="space-y-2">
              <SidebarMenuButton asChild>
                <NavLink 
                  to={`${basePath}/admin/perfil`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-primary/10"
                >
                  <User className="w-5 h-5" />
                  {state !== "collapsed" && <span>Meu Perfil</span>}
                </NavLink>
              </SidebarMenuButton>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="w-full justify-start gap-3 px-3 hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="w-5 h-5" />
                {state !== "collapsed" && <span>Sair</span>}
              </Button>
            </div>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}