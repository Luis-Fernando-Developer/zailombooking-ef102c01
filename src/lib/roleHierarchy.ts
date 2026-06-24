// Hierarquia de cargos — quanto maior o número, mais alto o cargo.
// Usado para regras como "supervisor só vê o próprio cargo e abaixo".
export const ROLE_LEVELS: Record<string, number> = {
  owner: 100,
  manager: 90,
  financeiro: 70,
  rh: 60,
  marketing: 60,
  supervisor: 50,
  receptionist: 30,
  employee: 10,
};

export const getRoleLevel = (role?: string | null): number =>
  ROLE_LEVELS[role ?? ""] ?? 0;

export const canManageRole = (managerRole: string, targetRole: string): boolean =>
  getRoleLevel(managerRole) >= getRoleLevel(targetRole);
