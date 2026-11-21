import { ReactNode, useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Loader2 } from 'lucide-react';

interface RequireRoleProps {
  children: ReactNode;
  allow: string[];
}

const routePermissions: Record<string, string[]> = {
  '/admin/realocacao': ['reallocation.view'],
  '/admin/ausencias': ['schedules.view_absences'],
  '/admin/colaboradores': ['employees.view'],
  '/admin/configuracoes': ['settings.view', 'settings.manage'],
  '/admin/chatbot': ['chatbot.view'],
  '/admin/chatbot/integracao': ['chatbot.view'],
  '/admin/integracao/chatbot': ['chatbot.view'],
  '/admin/chatbot/talkmap': ['chatbot.view'],
  '/admin/automacoes/chatbot/zailom-flow': ['chatbot.view'],
  '/admin/integracoes/whatsapp': ['whatsapp.view'],
  '/admin/integracoes/email': ['settings.view'],
  '/admin/integracoes/api': ['settings.view'],
  '/admin/automacoes/disparos': ['whatsapp.manage'],
  '/admin/automacoes/email-marketing': ['marketing.view'],
  '/admin/automacoes/gatilhos': ['bookings.view'],
  '/admin/bate-papo': ['chat.view'],
  '/admin/marketing': ['marketing.view'],
};

function requiredPermissions(pathname: string): string[] {
  const route = Object.keys(routePermissions)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname.includes(key));
  return route ? routePermissions[route] : [];
}

/** Permission-based route guard. Roles do not grant module access. */
export const RequireRole = ({ children }: RequireRoleProps) => {
  const { user, loading: authLoading } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!user || !slug) {
        if (mounted) setStatus('denied');
        return;
      }
      try {
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id, owner_email')
          .eq('slug', slug)
          .single();
        if (companyError || !company) {
          if (mounted) setStatus('denied');
          return;
        }

        const isOwner = String(company.owner_email || '').trim().toLowerCase() ===
          String(user.email || '').trim().toLowerCase();
        if (isOwner) {
          if (mounted) setStatus('allowed');
          return;
        }

        const { data, error } = await supabase.rpc('get_my_company_permissions', {
          p_company_id: company.id,
        });
        if (error) throw error;
        const result = data as { success?: boolean; role?: string; permissions?: string[] } | null;
        const permissions = new Set(result?.permissions || []);
        const isAdmin = result?.role === 'admin';
        const required = requiredPermissions(location.pathname);
        const allowed = isAdmin || (result?.success === true && required.some((code) => permissions.has(code)));
        if (mounted) setStatus(allowed ? 'allowed' : 'denied');
      } catch (error) {
        console.error('Permission route check failed:', error);
        if (mounted) setStatus('denied');
      }
    }
    if (!authLoading) check();
    return () => { mounted = false; };
  }, [user, authLoading, slug, location.pathname]);

  if (authLoading || status === 'checking') {
    return <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>;
  }

  if (status === 'denied') {
    return <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-destructive">Acesso Negado</h2>
        <p className="text-muted-foreground mt-2">Você não possui a permissão necessária para acessar esta área.</p>
      </div>
    </div>;
  }

  return <>{children}</>;
};
