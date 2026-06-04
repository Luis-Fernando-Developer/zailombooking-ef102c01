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
  userRole?: string;

  clientId?: string;
  currentUser?: SupabaseUser | null;
}

export function ClientSidebar({  companySlug, companyName, companyId, userRole,  clientId, currentUser }: ClientSidebarProps) {
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
          return ['owner', 'manager', 'supervisor'].includes(userRole);
        case "Configurações":
          return ['owner', 'manager'].includes(userRole);
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
      <Sidebar className={state === "collapsed" ? "w-14" : "w-64"}>
          <SidebarContent className="bg-card/30 backdrop-blur-sm border-r border-primary/20">
            {/* Header */}
            <div className="p-4 border-b border-primary/20">
              {state !== "collapsed" ? (
                <div >
                  <div className="mb-2">
                    <CompanyLogo companySlug={companySlug} showText={true} />
                  </div>
                  <h2 className="font-semibold text-gradient truncate">{companyName}</h2>
                  {/* <p className="text-sm text-muted-foreground capitalize">{userRole}</p> */}
                </div>
              ) : (
                <div className="flex justify-center">
                  <CompanyLogo companySlug={companySlug} showText={false} />
                </div>
              )}
            </div>
    
            {/* Navigation */}
            <SidebarGroup>
              <SidebarGroupLabel className={state === "collapsed" ? "sr-only" : ""}>
                Menu Principal
              </SidebarGroupLabel>
              <SidebarGroupContent>
                
                <SidebarMenu>
                  {filteredMenuItems.map((item) => (
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
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
    
            {/* User Actions */}
            <div className="mt-auto p-4 border-t border-primary/20">
              <div className="space-y-2">
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
          </SidebarContent>
      </Sidebar>
  
      
  );
}
