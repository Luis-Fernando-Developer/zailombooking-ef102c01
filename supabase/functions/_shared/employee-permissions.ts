import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type PermissionGuardResult = {
  allowed: boolean;
  userId: string;
  companyId: string;
  employeeId: string | null;
  role: string | null;
  reason?: 'missing_employee' | 'permission_denied';
};

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/**
 * Backend authorization source of truth for the new permission model.
 *
 * Owner/admin keep the same behavior as usePermissions: they receive all
 * active catalog permissions. Other employees must have an explicit row in
 * employee_permissions.
 */
export async function checkEmployeePermission(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  permissionCode: string,
): Promise<PermissionGuardResult> {
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id, role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (employeeError) {
    console.error('[PERMISSIONS] employee lookup failed:', employeeError);
    return {
      allowed: false,
      userId,
      companyId,
      employeeId: null,
      role: null,
      reason: 'missing_employee',
    };
  }

  if (!employee) {
    const { data: company } = await supabase
      .from('companies')
      .select('owner_email')
      .eq('id', companyId)
      .maybeSingle();

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const isOwner =
      !!company?.owner_email &&
      !!authUser.user?.email &&
      company.owner_email.trim().toLowerCase() === authUser.user.email.trim().toLowerCase();

    if (isOwner) {
      return {
        allowed: true,
        userId,
        companyId,
        employeeId: null,
        role: 'owner',
      };
    }

    return {
      allowed: false,
      userId,
      companyId,
      employeeId: null,
      role: null,
      reason: 'missing_employee',
    };
  }

  if (employee.role === 'owner' || employee.role === 'admin') {
    const { data: permission, error: permissionError } = await supabase
      .from('permissions')
      .select('code')
      .eq('code', permissionCode)
      .eq('is_active', true)
      .maybeSingle();

    if (permissionError) {
      console.error('[PERMISSIONS] catalog lookup failed:', permissionError);
      return {
        allowed: false,
        userId,
        companyId,
        employeeId: employee.id,
        role: employee.role,
        reason: 'permission_denied',
      };
    }

    return {
      allowed: !!permission,
      userId,
      companyId,
      employeeId: employee.id,
      role: employee.role,
      ...(permission ? {} : { reason: 'permission_denied' as const }),
    };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('employee_permissions')
    .select('permission_id, permissions!inner(code, is_active)')
    .eq('employee_id', employee.id)
    .eq('permissions.code', permissionCode)
    .eq('permissions.is_active', true)
    .maybeSingle();

  if (assignmentError) {
    console.error('[PERMISSIONS] assignment lookup failed:', assignmentError);
    return {
      allowed: false,
      userId,
      companyId,
      employeeId: employee.id,
      role: employee.role,
      reason: 'permission_denied',
    };
  }

  return {
    allowed: !!assignment,
    userId,
    companyId,
    employeeId: employee.id,
    role: employee.role,
    ...(assignment ? {} : { reason: 'permission_denied' as const }),
  };
}

export function permissionDeniedResponse(
  result: PermissionGuardResult,
  corsHeaders: Record<string, string>,
) {
  const detail = result.reason === 'missing_employee'
    ? 'Usuário não está vinculado a um funcionário desta empresa.'
    : 'Funcionário não possui a permissão necessária.';

  return new Response(JSON.stringify({
    error: 'forbidden',
    permission_denied: true,
    detail,
  }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
