import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BusinessSidebar } from "@/components/business/BusinessSidebar";
import { Button } from "../ui/button";
import { Copy } from "lucide-react";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { PlanOverageBanner } from "@/components/business/PlanOverageBanner";
import { PlatformNotificationModal } from "@/components/business/PlatformNotificationModal";
import { NotificationsBell } from "@/components/business/NotificationsBell";


interface BusinessLayoutProps {
  children: ReactNode;
  companySlug: string;
  companyName: string;
  companyId?: string;
  userRole: string;
  currentUser?: SupabaseUser | null;
  hideHeader?: boolean;
}

export function BusinessLayout({ 
  children, 
  companySlug, 
  companyName, 
  companyId, 
  userRole, 
  currentUser,
  hideHeader = false 
}: BusinessLayoutProps) {
  return (
    <SidebarProvider className="min-h-screen flex w-full">
      <PlatformNotificationModal companyId={companyId} />
      <BusinessSidebar 
        companySlug={companySlug} 
        companyName={companyName}
        companyId={companyId}
        userRole={userRole}
        currentUser={currentUser}
      />
      
      <div className="flex flex-col flex-1 h-screen transition-[margin,width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] relative overflow-hidden">
        {!hideHeader ? (
          <header className="h-[70px] shrink-0 w-full flex items-center border-b border-primary/20 bg-card/80 backdrop-blur-2xl px-4 z-40">
            <SidebarTrigger className="text-foreground hover:bg-primary/10" />
            <div className="ml-4 flex flex-col -space-y-2 py-3">
              <h1 className="text-lg font-semibold text-gradient">{companyName} - Painel Administrativo</h1>
              <div className="flex items-center text-sm text-muted-foreground">
                <span className="stroke-primary-glow border-dashed">https://booking.zailom.com/{companySlug}</span>
                <Button size="sm" variant="link" className="ml-2 p-0"><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <NotificationsBell companyId={companyId} companySlug={companySlug} />
            </div>
          </header>
        ) : (
          <div className="absolute top-4 left-4 z-50">
            <SidebarTrigger className="text-foreground hover:bg-primary/10 bg-card/80 backdrop-blur-md border border-primary/20 rounded-md p-2" />
          </div>
        )}

        <main className={`flex-1 ${hideHeader ? 'overflow-hidden h-screen' : 'overflow-y-auto'} bg-gradient-hero scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent`}>
          <div className={`w-full ${hideHeader ? 'h-full flex flex-col' : ''}`}>
            {!hideHeader && (
              <div className="px-4 pt-4">
                <PlanOverageBanner companyId={companyId} />
              </div>
            )}
            <div className={hideHeader ? "flex-1 overflow-hidden" : ""}>
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}