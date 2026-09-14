import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

export type UserRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'receptionist'
  | 'employee'
  | 'rh'
  | 'marketing'
  | 'designer';

/**
 * Legacy permission shape kept temporarily so existing screens do not break.
 * The source of truth is now employee_permissions -> permissions.
 */
export interface PermissionLevel {
  canManageEmployees: boolean;
  canViewEmployees: boolean;
  canManageServices: boolean;
  canViewServices: boolean;
  canManageAllBookings: boolean;
  canViewAllBookings: boolean;
  canManageOwnBookings: boolean;
  canManageClients: boolean;
  canViewClients: boolean;
  canViewFinancialReports: boolean;
  canViewBasicReports: boolean;
  canViewDashboard: boolean;
  canManageSettings: boolean;
  canManageSubscription: boolean;
  canDeleteOwner: boolean;
  hasPermission: (code: string) => boolean;
}

const EMPTY_PERMISSIONS: Omit<PermissionLevel, 'hasPermission'> = {
  canManageEmployees: false,
  canViewEmployees: false,
  canManageServices: false,
  canViewServices: false,
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

function buildPermissionLevel(permissionCodes: Set<string>): PermissionLevel {
  const hasPermission = (code: string) => permissionCodes.has(code);

  return {
    ...EMPTY_PERMISSIONS,
    canManageEmployees:
      hasPermission('employees.create') ||
      hasPermission('employees.edit') ||
      hasPermission('employees.delete'),
    canViewEmployees: hasPermission('employees.view'),
    canManageServices:
      hasPermission('services.create') ||
      hasPermission('services.edit') ||
      hasPermission('services.delete'),
    canViewServices: hasPermission('services.view'),
    canManageAllBookings:
      hasPermission('bookings.create') ||
      hasPermission('bookings.edit') ||
      hasPermission('bookings.cancel') ||
      hasPermission('bookings.manage_all'),
    canViewAllBookings: hasPermission('bookings.view'),
    canManageOwnBookings: hasPermission('bookings.manage_own'),
    canManageClients:
      hasPermission('clients.create') ||
      hasPermission('clients.edit') ||
      hasPermission('clients.delete'),
    canViewClients: hasPermission('clients.view'),
    canViewFinancialReports: hasPermission('reports.view_financial'),
    canViewBasicReports: hasPermission('reports.view_basic'),
    canViewDashboard: hasPermission('dashboard.view'),
    canManageSettings: hasPermission('settings.manage'),
    canManageSubscription: hasPermission('subscription.manage'),
    canDeleteOwner: false,
    hasPermission,
  };
}

export function usePermissions(companyId?: string, user?: User | null) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [permissionCodes, setPermissionCodes] = useState<Set<string>>(new Set());
  const [permissions, setPermissions] = useState<PermissionLevel | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user || !companyId) {
      setUserRole(null);
      setEmployeeId(null);
      setPermissionCodes(new Set());
      setPermissions(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('id, role')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (employeeError) throw employeeError;

      if (!employee) {
        setUserRole(null);
        setEmployeeId(null);
        setPermissionCodes(new Set());
        setPermissions(null);
        return;
      }

      const role = employee.role as UserRole;
      setUserRole(role);
      setEmployeeId(employee.id);

      const { data: rows, error: permissionsError } = await supabase
        .from('employee_permissions')
        .select('permission_id, permissions!inner(code, is_active)')
        .eq('employee_id', employee.id);

      if (permissionsError) throw permissionsError;

      const codes = new Set<string>();

      for (const row of rows ?? []) {
        const permission = row.permissions as
          | { code?: string; is_active?: boolean }
          | { code?: string; is_active?: boolean }[]
          | null;

        const item = Array.isArray(permission) ? permission[0] : permission;

        if (item?.code && item.is_active !== false) {
          codes.add(item.code);
        }
      }

      // Owner/admin remain system-level administrators during migration.
      // Every other employee depends exclusively on employee_permissions.
      if (role === 'owner' || role === 'admin') {
        const { data: activePermissions, error: catalogError } = await supabase
          .from('permissions')
          .select('code')
          .eq('is_active', true);

        if (catalogError) throw catalogError;

        for (const permission of activePermissions ?? []) {
          if (permission.code) codes.add(permission.code);
        }
      }

      setPermissionCodes(codes);
      setPermissions(buildPermissionLevel(codes));
    } catch (error) {
      console.error('Error fetching employee permissions:', error);
      setUserRole(null);
      setEmployeeId(null);
      setPermissionCodes(new Set());
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, user]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Keep the sidebar and permission-aware screens synchronized when the
  // current employee's permissions are changed without a new login.
  useEffect(() => {
    if (!employeeId || !companyId) return;

    const channel = supabase
      .channel(`employee-permissions-${employeeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employee_permissions',
          filter: `employee_id=eq.${employeeId}`,
        },
        () => {
          fetchPermissions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'employees',
          filter: `id=eq.${employeeId}`,
        },
        () => {
          fetchPermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeId, companyId, fetchPermissions]);

  const hasPermission = useCallback(
    (code: string) => permissionCodes.has(code),
    [permissionCodes]
  );

  return {
    userRole,
    permissions,
    permissionCodes,
    hasPermission,
    loading,
    refreshPermissions: fetchPermissions,
  };
}

export function useHasPermission(
  companyId?: string,
  user?: User | null,
  permission?: keyof PermissionLevel
) {
  const { permissions, loading } = usePermissions(companyId, user);

  if (!permission || permission === 'hasPermission' || loading || !permissions) {
    return { hasPermission: false, loading };
  }

  return { hasPermission: permissions[permission], loading };
}
