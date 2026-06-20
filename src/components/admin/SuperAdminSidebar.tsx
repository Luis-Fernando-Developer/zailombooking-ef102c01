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
  Building2, 
  Layers, 
  CreditCard,
  Settings,
  LogOut,
  Sparkles,
  Megaphone,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

const menuItems = [
  { title: "Dashboard", url: "/super-admin/painel", icon: LayoutDashboard },
  { title: "Instâncias", url: "/super-admin/instancias", icon: Layers },
  { title: "Empresas", url: "/super-admin/empresas", icon: Building2 },
  { title: "Planos", url: "/super-admin/planos", icon: CreditCard },
  { title: "Features", url: "/super-admin/features", icon: Sparkles },
  { title: "Release Notes", url: "/super-admin/release-notes", icon: Megaphone },
  { title: "Configurações", url: "/super-admin/configuracoes", icon: Settings },
];

export function SuperAdminSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Logout realizado",
        description: "Até logo!",
      });
      navigate('/super-admin/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const getNavCls = (active: boolean) =>
    active 
      ? "bg-primary/20 text-primary border-r-2 border-primary" 
      : "hover:bg-primary/10 hover:text-primary";

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20 h-screen sticky top-0 transition-all duration-700">
      <SidebarContent className="bg-card/30 backdrop-blur-sm border-r border-primary/20 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-primary/20 flex flex-col items-center justify-center min-h-[100px]">
          {state !== "collapsed" ? (
            <div className="w-full text-center">
              <BookingLogo showText={false} className="mb-2 mx-auto" />
              <h2 className="font-semibold text-gradient truncate">Super Admin</h2>
              <p className="text-sm text-muted-foreground">Sistema</p>
            </div>
          ) : (
            <div className="flex justify-center">
              <BookingLogo showText={false} />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="overflow-y-auto h-full scrollbar-none py-4">
          <SidebarGroup>
            <SidebarGroupLabel className={state === "collapsed" ? "sr-only" : ""}>
              Administração
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url} 
                        className={() => 
                          `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 ${
                            state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full"
                          } ${getNavCls(isActive(item.url))}`
                        }
                      >
                        <item.icon className={`w-5 h-5 flex-shrink-0 ${state === "collapsed" ? "m-0" : ""}`} />
                        {state !== "collapsed" && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>

        {/* Footer / Logout */}
        <div className="mt-auto p-4 border-t border-primary/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={`flex items-center gap-3 px-3 transition-all duration-300 ${
              state === "collapsed" ? "justify-center w-10 h-10 p-0" : "w-full justify-start"
            } hover:bg-destructive/10 hover:text-destructive`}
          >
            <LogOut className={`w-5 h-5 ${state === "collapsed" ? "m-0" : ""}`} />
            {state !== "collapsed" && <span>Sair</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
