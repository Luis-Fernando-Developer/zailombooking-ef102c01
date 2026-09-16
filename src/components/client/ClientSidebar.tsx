import { User as SupabaseUser } from '@supabase/supabase-js';
import { Calendar, LayoutDashboard, LogOut, User } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar';
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
  className?: string;
}

export function ClientSidebar({ className, companySlug, companyName, companyId, companyLogoUrl, userRole, clientId, clientName, clientAvatarUrl, currentUser }: ClientSidebarProps) {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { permissions, loading } = usePermissions(companyId, currentUser);

  const currentPath = location.pathname;
  const basePath = `/${companySlug}`;

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
    if (loading) {
      return ['Dashboard', 'Agendamentos', 'Serviços'].includes(item.title);
    }

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
    <>
      <style>{`
        @media (min-width: 768px) {
          /* Dashboard/Profile: the header currently sits outside the sidebar row.
             Turn that wrapper into the same 256px/48px desktop layout used by
             ClientLayout, without touching any booking logic. */
          div[class~="group/sidebar-wrapper"]:has([data-client-sidebar="true"]):not(:has(> [data-client-sidebar="true"])) > div.flex.flex-col.h-screen {
            display: grid !important;
            grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
            grid-template-rows: 5rem minmax(0, 1fr);
            transition: grid-template-columns 700ms cubic-bezier(0.4, 0, 0.2, 1);
            min-width: 0;
            min-height: 0;
          }

          div[class~="group/sidebar-wrapper"]:has([data-client-sidebar="true"]):not(:has(> [data-client-sidebar="true"])) > div.flex.flex-col.h-screen:has([data-client-sidebar="true"][data-state="collapsed"]) {
            grid-template-columns: var(--sidebar-width-icon) minmax(0, 1fr);
          }

          div[class~="group/sidebar-wrapper"]:has([data-client-sidebar="true"]):not(:has(> [data-client-sidebar="true"])) > div.flex.flex-col.h-screen > header {
            grid-column: 2;
            grid-row: 1;
            width: 100%;
          }

          div[class~="group/sidebar-wrapper"]:has([data-client-sidebar="true"]):not(:has(> [data-client-sidebar="true"])) > div.flex.flex-col.h-screen > div.flex.flex-1 {
            display: contents;
          }

          div[class~="group/sidebar-wrapper"]:has([data-client-sidebar="true"]):not(:has(> [data-client-sidebar="true"])) > div.flex.flex-col.h-screen > div.flex.flex-1 > [data-client-sidebar="true"] {
            grid-column: 1;
            grid-row: 2;
            min-width: 0;
            min-height: 0;
          }

          div[class~="group/sidebar-wrapper"]:has([data-client-sidebar="true"]):not(:has(> [data-client-sidebar="true"])) > div.flex.flex-col.h-screen > div.flex.flex-1 > main {
            grid-column: 2;
            grid-row: 2;
            min-width: 0;
            min-height: 0;
            width: 100%;
          }
        }
      `}</style>

      <Sidebar
        data-client-sidebar="true"
        className={className || ""}
        collapsible="icon"
      >
        <SidebarContent className="h-full bg-card/30 backdrop-blur-md border-r border-primary/20">
          <div className="py-3 flex justify-center items-center gap-3 border-b border-primary/10">
            {state === "collapsed" ? (
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white font-black overflow-hidden">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={companyName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (companyName || "?").charAt(0).toUpperCase()
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 min-w-0 w-full px-2">
                <CompanyLogo
                  companySlug={companySlug}
                  className="w-44 top-0 flex flex-col object-contain"
                />
                <div className="flex flex-col truncate">
                  <span className="font-black text-sm tracking-tight text-foreground truncate uppercase">
                    {companyName}
                  </span>
                </div>
              </div>
            )}
          </div>

          <SidebarGroup className="px-3 py-6">
            <SidebarGroupLabel
              className={
                state === "collapsed"
                  ? "flex gap-2 items-center justify-center"
                  : "px-3 mb-4 text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/40"
              }
            >
              Menu Principal
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={state === "collapsed" ? "overflow-hidden flex flex-col gap-2 items-center justify-center" : "flex flex-col gap-2"}>
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
                        <item.icon className="w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover/item:scale-110" />
                        {state !== "collapsed" && (
                          <span className="font-bold text-sm tracking-tight">{item.title}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <div className="overflow-hidden mt-auto p-4 border-t border-primary/10 bg-primary/5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start gap-3 px-4 h-12 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors group/logout"
            >
              <LogOut className="w-5 h-5 group-hover/logout:-translate-x-1 transition-transform" />
              {state !== "collapsed" && <span className="font-bold text-sm overflow-hidden">Encerrar Sessão</span>}
            </Button>
          </div>
        </SidebarContent>
      </Sidebar>
    </>
  );
}