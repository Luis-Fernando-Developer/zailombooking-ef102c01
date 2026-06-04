import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

export type UserRole = 'owner' | 'manager' | 'supervisor' | 'receptionist' | 'employee';

export interface PermissionLevel {
  // Gestão de funcionários
  canManageEmployees: boolean;
  canViewEmployees: boolean;
  
  // Gestão de serviços
  canManageServices: boolean;
  canViewServices: boolean;
  
  // Gestão de agendamentos
  canManageAllBookings: boolean;
  canViewAllBookings: boolean;
  canManageOwnBookings: boolean;
  
  // Gestão de clientes
  canManageClients: boolean;
  canViewClients: boolean;
  
  // Relatórios e dashboards
  canViewFinancialReports: boolean;
  canViewBasicReports: boolean;
  canViewDashboard: boolean;
  
  // Configurações
  canManageSettings: boolean;
  canManageSubscription: boolean;
  
  // Operações específicas
  canDeleteOwner: boolean;
}

export function usePermissions(companyId?: string, user?: User | null) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<PermissionLevel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !companyId) {
      setUserRole(null);
      setPermissions(null);
      setLoading(false);
      return;
    }

    const fetchUserRole = async () => {
      try {
        // Get role directly from employees table since get_user_role function doesn't exist
        const { data, error } = await supabase
          .from('employees')
          .select('role')
          .eq('company_id', companyId)
          .eq('user_id', user.id)
          .single();

        if (error) throw error;

        const role = (data?.role || 'employee') as UserRole;
        setUserRole(role);
        setPermissions(getPermissionsByRole(role));
      } catch (error) {
        console.error('Error fetching user role:', error);
        setUserRole(null);
        setPermissions(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user, companyId]);

  return { userRole, permissions, loading };
}

function getPermissionsByRole(role: UserRole): PermissionLevel {
  const basePermissions: PermissionLevel = {
    canManageEmployees: false,
    canViewEmployees: false,
    canManageServices: false,
    canViewServices: true,
    canManageAllBookings: false,
    canViewAllBookings: false,
    canManageOwnBookings: false,
    canManageClients: false,
    canViewClients: false,
    canViewFinancialReports: false,
    canViewBasicReports: false,
    canViewDashboard: false,
    canManageSettings: false,
    canManageSubscription: false,
    canDeleteOwner: false,
  };

  switch (role) {
    case 'owner':
      return {
        ...basePermissions,
        canManageEmployees: true,
        canViewEmployees: true,
        canManageServices: true,
        canManageAllBookings: true,
        canViewAllBookings: true,
        canManageOwnBookings: true,
        canManageClients: true,
        canViewClients: true,
        canViewFinancialReports: true,
        canViewBasicReports: true,
        canViewDashboard: true,
        canManageSettings: true,
        canManageSubscription: true,
        canDeleteOwner: false, // Não pode se excluir
      };

    case 'manager':
      return {
        ...basePermissions,
        canManageEmployees: true, // Exceto Owner
        canViewEmployees: true,
        canManageServices: true,
        canManageAllBookings: true,
        canViewAllBookings: true,
        canManageOwnBookings: true,
        canManageClients: true,
        canViewClients: true,
        canViewFinancialReports: true,
        canViewBasicReports: true,
        canViewDashboard: true,
        canManageSettings: true,
        canManageSubscription: false,
        canDeleteOwner: false,
      };

    case 'supervisor':
      return {
        ...basePermissions,
        canManageEmployees: false,
        canViewEmployees: true,
        canManageServices: false,
        canManageAllBookings: true,
        canViewAllBookings: true,
        canManageOwnBookings: true,
        canManageClients: true,
        canViewClients: true,
        canViewFinancialReports: false,
        canViewBasicReports: true,
        canViewDashboard: true,
        canManageSettings: false,
        canManageSubscription: false,
        canDeleteOwner: false,
      };

    case 'receptionist':
      return {
        ...basePermissions,
        canManageEmployees: false,
        canViewEmployees: false,
        canManageServices: false,
        canManageAllBookings: true,
        canViewAllBookings: true,
        canManageOwnBookings: true,
        canManageClients: true,
        canViewClients: true,
        canViewFinancialReports: false,
        canViewBasicReports: false,
        canViewDashboard: true,
        canManageSettings: false,
        canManageSubscription: false,
        canDeleteOwner: false,
      };

    case 'employee':
      return {
        ...basePermissions,
        canManageEmployees: false,
        canViewEmployees: false,
        canManageServices: false,
        canManageAllBookings: false,
        canViewAllBookings: false,
        canManageOwnBookings: true,
        canManageClients: false,
        canViewClients: true, // Apenas nos próprios atendimentos
        canViewFinancialReports: false,
        canViewBasicReports: false,
        canViewDashboard: true,
        canManageSettings: false,
        canManageSubscription: false,
        canDeleteOwner: false,
      };

    default:
      return basePermissions;
  }
}

// Hook auxiliar para verificar permissão específica
export function useHasPermission(companyId?: string, user?: User | null, permission?: keyof PermissionLevel) {
  const { permissions, loading } = usePermissions(companyId, user);
  
  if (!permission || loading || !permissions) {
    return { hasPermission: false, loading };
  }

  return { hasPermission: permissions[permission], loading };
}