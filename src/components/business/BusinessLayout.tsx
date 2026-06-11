import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BusinessSidebar } from "@/components/business/BusinessSidebar";
import { Button } from "../ui/button";
import { Copy } from "lucide-react";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { PlanOverageBanner } from "@/components/business/PlanOverageBanner";


interface BusinessLayoutProps {
  children: ReactNode;
  companySlug: string;
  companyName: string;
  companyId: string;
  userRole: string;
  currentUser?: SupabaseUser | null;
}

export function BusinessLayout({ children, companySlug, companyName, companyId, userRole, currentUser }: BusinessLayoutProps) {
  return (
    <SidebarProvider className="min-h-screen flex w-full">
      <BusinessSidebar 
        companySlug={companySlug} 
        companyName={companyName}
        companyId={companyId}
        userRole={userRole}
        currentUser={currentUser}
      />
      
      <div className="flex flex-col flex-1 min-h-screen transition-[margin,width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] relative overflow-x-hidden">
        <header className="h-[70px] w-full flex items-center border-b border-primary/20 bg-card/80 backdrop-blur-2xl px-4 sticky top-0 z-40">
          <SidebarTrigger className="text-foreground hover:bg-primary/10" />
          <div className="ml-4 flex flex-col -space-y-2 py-3">
            <h1 className="text-lg font-semibold text-gradient">{companyName} - Painel Administrativo</h1>
            <div className="flex items-center text-sm text-muted-foreground">
              <span className="stroke-primary-glow border-dashed">https://booking.zailom.com/{companySlug}</span>
              <Button size="sm" variant="link" className="ml-2 p-0"><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col w-full bg-gradient-hero">
          <div className="flex-1 w-full">
            <div className="px-4 pt-4">
              <PlanOverageBanner companyId={companyId} />
            </div>
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}