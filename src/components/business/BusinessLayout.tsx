import { ReactNode, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BusinessSidebar } from "@/components/business/BusinessSidebar";
import { Button } from "../ui/button";
import { Copy, Check } from "lucide-react";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { PlanOverageBanner } from "@/components/business/PlanOverageBanner";
import { SubscriptionSuspendedBanner } from "@/components/business/SubscriptionSuspendedBanner";
import { PlatformNotificationModal } from "@/components/business/PlatformNotificationModal";
import { NotificationsBell } from "@/components/business/NotificationsBell";
import { ThemeToggle, applyTheme, getInitialTheme } from "@/components/ThemeToggle";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";


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
  const { toast } = useToast();

  useEffect(() => {
    applyTheme(getInitialTheme("admin"));
  }, []);
  const [copied, setCopied] = useState(false);
  const publicUrl = `https://booking.zailom.com/${companySlug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast({ title: "Link copiado!", description: publicUrl });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

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
          <header className="min-h-[70px] shrink-0 w-full flex items-center border-b border-primary/20 bg-card/80 backdrop-blur-2xl px-3 sm:px-4 z-40 gap-2">
            <SidebarTrigger className="text-foreground hover:bg-primary/10 shrink-0" />
            <div className="ml-1 sm:ml-4 flex flex-col py-2 sm:py-3 min-w-0 flex-1">
              <h1 className="text-sm sm:text-lg font-semibold text-gradient truncate leading-tight">{companyName}</h1>
              <span className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground/80 leading-tight">Painel Admin</span>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] sm:text-sm text-muted-foreground min-w-0">
                <span className="truncate underline-offset-2 decoration-dashed decoration-primary/50">{publicUrl}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copiar link público"
                  className="shrink-0 rounded p-1 hover:bg-primary/10 text-primary"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <ThemeToggle />
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
                <SubscriptionSuspendedBanner companyId={companyId} />
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