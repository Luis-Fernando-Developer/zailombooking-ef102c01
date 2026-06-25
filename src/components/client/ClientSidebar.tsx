import { User as SupabaseUser } from '@supabase/supabase-js';
import { Calendar, LayoutDashboard, LogOut, User } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar';
import { CompanyLogo } from '../CompanyLogo';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { supabase } from "@/lib/supabaseClient";

const ClienteMenuItems = [
  { title: 'Dashboard', url: '/client/dashboard', icon: LayoutDashboard, current: true },
  { title: 'Meus Agendamentos', url: '/agendamentos', icon: Calendar, current: false },
  { title: 'Meu Perfil', url: '/client/perfil', icon: User, current: false },
];

interface ClientSidebarProps {
  
  companySlug: string;
  companyName: string;
  companyId: string;
  companyLogoUrl?: string | null;
  userRole?: string;

  clientId?: string;
  clientName?: string | null;
  clientAvatarUrl?: string | null;
  currentUser?: SupabaseUser | null;
}

export function ClientSidebar({  companySlug, companyName, companyId, companyLogoUrl, userRole,  clientId, clientName, clientAvatarUrl, currentUser }: ClientSidebarProps) {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { permissions, loading } = usePermissions(companyId, currentUser);

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

  const filteredMenuItems = ClienteMenuItems.filter(item => {
    // Durante o carregamento, mostrar itens básicos
    if (loading) {
      return ['Dashboard', 'Agendamentos', 'Serviços'].includes(item.title);
    }

    // Se não temos permissões, usar role como fallback
    if (!permissions) {
      switch (item.title) {
        case "Colaboradores":
          return ['owner', 'manager', 'supervisor'].includes(userRole || '');
        case "Configurações":
          return ['owner', 'manager'].includes(userRole || '');
        default:
          return true;
      }
    }

    // Usar permissões quando disponíveis
    switch (item.title) {
      case "Colaboradores":
        return permissions.canViewEmployees;
      case "Configurações":
        return permissions.canManageSettings;
      default:
        return true;
    }
  });

  return (
    <Sidebar className={state === "collapsed" ? "w-14" : "w-64"} collapsible="none">
      <SidebarContent className="bg-card/30 backdrop-blur-md border-r border-primary/20 overflow-hidden pt-20">
        {/* Navigation */}
        <SidebarGroup className="px-3 py-6">
          <SidebarGroupLabel className={state === "collapsed" ? "sr-only" : "px-3 mb-4 text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/40"}>
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink 
                      to={`${basePath}${item.url}`} 
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group/item ${
                          isActive 
                            ? "bg-primary/10 text-primary border border-primary/20 shadow-neon/10" 
                            : "text-muted-foreground hover:bg-primary/5 hover:text-primary-glow"
                        }`
                      }
                    >
                      <item.icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover/item:scale-110`} />
                      {state !== "collapsed" && <span className="font-bold text-sm tracking-tight">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Actions */}
        <div className="mt-auto p-4 border-t border-primary/10 bg-primary/5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-3 px-4 h-12 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors group/logout"
          >
            <LogOut className="w-5 h-5 group-hover/logout:-translate-x-1 transition-transform" />
            {state !== "collapsed" && <span className="font-bold text-sm">Encerrar Sessão</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
