import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

export type UserRole =
  | 'owner' | 'admin' | 'manager' | 'supervisor' | 'receptionist'
  | 'employee' | 'rh' | 'marketing' | 'designer';

export interface PermissionLevel {
  canManageEmployees: boolean; canViewEmployees: boolean;
  canManageServices: boolean; canViewServices: boolean;
  canManageAllBookings: boolean; canViewAllBookings: boolean;
  canManageOwnBookings: boolean; canManageClients: boolean; canViewClients: boolean;
  canViewFinancialReports: boolean; canViewBasicReports: boolean;
  canViewDashboard: boolean; canManageSettings: boolean;
  canManageSubscription: boolean; canDeleteOwner: boolean;
  hasPermission: (code: string) => boolean;
}

const EMPTY_PERMISSIONS: Omit<PermissionLevel, 'hasPermission'> = {
  canManageEmployees:false, canViewEmployees:false, canManageServices:false, canViewServices:false,
  canManageAllBookings:false, canViewAllBookings:false, canManageOwnBookings:false,
  canManageClients:false, canViewClients:false, canViewFinancialReports:false,
  canViewBasicReports:false, canViewDashboard:false, canManageSettings:false,
  canManageSubscription:false, canDeleteOwner:false,
};

function buildPermissionLevel(codes: Set<string>): PermissionLevel {
  const hasPermission = (code: string) => codes.has(code);
  return {
    ...EMPTY_PERMISSIONS,
    canManageEmployees:['employees.create','employees.edit','employees.delete'].some(hasPermission),
    canViewEmployees:hasPermission('employees.view'),
    canManageServices:['services.create','services.edit','services.delete'].some(hasPermission),
    canViewServices:hasPermission('services.view'),
    canManageAllBookings:['bookings.create','bookings.edit','bookings.cancel','bookings.manage_all'].some(hasPermission),
    canViewAllBookings:hasPermission('bookings.view'),
    canManageOwnBookings:hasPermission('bookings.manage_own'),
    canManageClients:['clients.create','clients.edit','clients.delete'].some(hasPermission),
    canViewClients:hasPermission('clients.view'),
    canViewFinancialReports:hasPermission('reports.view_financial'),
    canViewBasicReports:hasPermission('reports.view_basic'),
    canViewDashboard:hasPermission('dashboard.view'),
    canManageSettings:hasPermission('settings.manage'),
    canManageSubscription:hasPermission('subscription.manage'),
    canDeleteOwner:false,
    hasPermission,
  };
}

export function usePermissions(companyId?: string, user?: User | null) {
  const [userRole,setUserRole] = useState<UserRole|null>(null);
  const [employeeId,setEmployeeId] = useState<string|null>(null);
  const [permissionCodes,setPermissionCodes] = useState<Set<string>>(new Set());
  const [permissions,setPermissions] = useState<PermissionLevel|null>(null);
  const [loading,setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user || !companyId) {
      setUserRole(null); setEmployeeId(null); setPermissionCodes(new Set());
      setPermissions(null); setLoading(false); return;
    }
    setLoading(true);
    try {
      // Security-definer RPC avoids frontend permission loading being blocked
      // by employee/employee_permissions RLS policies.
      const { data, error } = await supabase.rpc('get_my_company_permissions', {
        p_company_id: companyId,
      });
      if (error) throw error;
      const result = data as { success?: boolean; role?: string; employee_id?: string; permissions?: string[]; error?: string } | null;
      if (!result?.success || !result.role) {
        setUserRole(null); setEmployeeId(null); setPermissionCodes(new Set());
        setPermissions(null); return;
      }
      const codes = new Set(result.permissions ?? []);
      setUserRole(result.role as UserRole);
      setEmployeeId(result.employee_id ?? null);
      setPermissionCodes(codes);
      setPermissions(buildPermissionLevel(codes));
    } catch (error) {
      console.error('Error fetching employee permissions:', error);
      setUserRole(null); setEmployeeId(null); setPermissionCodes(new Set()); setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, [companyId,user]);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const hasPermission = useCallback(
    (code:string) => userRole === 'owner' || userRole === 'admin' || permissionCodes.has(code),
    [permissionCodes,userRole]
  );
  return { userRole,employeeId,permissions,permissionCodes,hasPermission,loading,refreshPermissions:fetchPermissions };
}

export function useHasPermission(companyId?:string,user?:User|null,permission?:keyof PermissionLevel) {
  const { permissions,loading } = usePermissions(companyId,user);
  if (!permission || permission === 'hasPermission' || loading || !permissions) return { hasPermission:false,loading };
  return { hasPermission:permissions[permission],loading };
}
