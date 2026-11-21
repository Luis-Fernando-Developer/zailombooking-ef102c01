import { ReactNode, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/use-permissions';
import { Loader2 } from 'lucide-react';

interface RequireRoleProps {
  children: ReactNode;
  allow?: string[];
}

const routePermissions: Record<string, string[]> = {
  '/admin/dashboard': ['dashboard.view'],
  '/admin/agendamentos': ['bookings.view'],
  '/admin/clientes': ['clients.view'],
  '/admin/relatorios': ['reports.view_basic'],
  '/admin/financeiro': ['finance.view'],
  '/admin/realocacao': ['reallocation.view'],
  '/admin/ausencias': ['schedules.view_absences'],
  '/admin/servicos': ['services.view_services','services.view_combos','services.view_gifts'],
  '/admin/cupons': ['coupons.view'],
  '/admin/colaboradores': ['employees.view'],
  '/admin/estrutura-organizacional': ['employees.view'],
  '/admin/recursos-humanos': ['hr.view','hr.documents.view','hr.evaluations.view','hr.history.view'],
  '/admin/configuracoes': ['settings.view','settings.manage'],
  '/admin/billing': ['subscription.manage'],
  '/admin/chatbot': ['chatbot.view'],
  '/admin/integracao/chatbot': ['chatbot.view'],
  '/admin/chatbot/talkmap': ['chatbot.view'],
  '/admin/automacoes/chatbot/zailom-flow': ['chatbot.view'],
  '/admin/integracoes/whatsapp': ['whatsapp.view'],
  '/admin/integracoes/email': ['settings.view'],
  '/admin/integracoes/api': ['settings.view'],
  '/admin/automacoes/disparos': ['whatsapp.manage'],
  '/admin/automacoes/email-marketing': ['marketing.view'],
  '/admin/automacoes/gatilhos': ['bookings.view'],
  '/admin/horarios': ['schedules.view_establishment','schedules.view_fixed','schedules.view_autonomous','schedules.view_absences','schedules.view_blocks','schedules.view_shifts','schedules.view_breaks','schedules.view_rules'],
  '/admin/solicitacoes': ['reallocation.view'],
  '/admin/notificacoes': ['dashboard.view'],
  '/admin/bate-papo': ['chat.view'],
  '/admin/marketing': ['marketing.view'],
};

export const RequireRole = ({ children }: RequireRoleProps) => {
  const { user, loading: authLoading } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [companyId, setCompanyId] = useState<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (!slug) return;
    supabase.from('companies').select('id').eq('slug', slug).maybeSingle()
      .then(({ data }) => { if (active) setCompanyId(data?.id); });
    return () => { active = false; };
  }, [slug]);
  const permissions = usePermissions(companyId, user);
  const required = Object.keys(routePermissions).sort((a,b)=>b.length-a.length)
    .find((route) => location.pathname.includes(route));
  const allowed = permissions.hasPermission('*') ||
    (required ? routePermissions[required].some((code) => permissions.hasPermission(code)) : false);

  if (authLoading || !companyId || permissions.loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!user || !allowed) {
    return <div className="min-h-screen flex items-center justify-center bg-background p-6"><div className="text-center"><h2 className="text-2xl font-bold text-destructive">Acesso Negado</h2><p className="text-muted-foreground mt-2">Você não possui a permissão necessária para acessar esta área.</p></div></div>;
  }
  return <>{children}</>;
};

import { supabase } from '@/lib/supabaseClient';
