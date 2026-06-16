import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Loader2 } from 'lucide-react';
import type { UserRole } from '@/hooks/use-permissions';

interface RequireRoleProps {
  children: ReactNode;
  allow: UserRole[];
}

/**
 * Protege rotas com base no role do colaborador (ou owner pela company.owner_email).
 * Se não autorizado, redireciona para o dashboard da empresa.
 */
export const RequireRole = ({ children, allow }: RequireRoleProps) => {
  const { user, loading: authLoading } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!user || !slug) {
        if (mounted) setStatus('denied');
        return;
      }
      try {
        const { data: company } = await supabase
          .from('companies')
          .select('id, owner_email')
          .eq('slug', slug)
          .single();

        if (!company) {
          if (mounted) setStatus('denied');
          return;
        }

        const isOwner =
          (company.owner_email || '').toLowerCase() ===
          (user.email || '').toLowerCase();

        if (isOwner && allow.includes('owner')) {
          if (mounted) setStatus('allowed');
          return;
        }

        const { data: emp } = await supabase
          .from('employees')
          .select('role')
          .eq('company_id', company.id)
          .eq('user_id', user.id)
          .maybeSingle();

        const role = (emp?.role || 'employee') as UserRole;
        if (mounted) setStatus(allow.includes(role) ? 'allowed' : 'denied');
      } catch {
        if (mounted) setStatus('denied');
      }
    }
    if (!authLoading) check();
    return () => {
      mounted = false;
    };
  }, [user, authLoading, slug, allow]);

  if (authLoading || status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'denied') {
    return <Navigate to={slug ? `/${slug}/admin/dashboard` : '/login'} replace />;
  }

  return <>{children}</>;
};
