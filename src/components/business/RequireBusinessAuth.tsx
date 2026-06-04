import { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface RequireBusinessAuthProps {
  children: ReactNode;
}

export const RequireBusinessAuth = ({ children }: RequireBusinessAuthProps) => {
  const { user, loading } = useAuth();
  const { slug } = useParams<{ slug: string }>();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    console.log('[RequireBusinessAuth] No user, redirecting to login');
    return <Navigate to={slug ? `/${slug}/admin/login` : '/login'} replace />;
  }

  return <>{children}</>;
};
