const normalizeRole = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }

  if (Array.isArray(value)) {
    return normalizeRole(value[0]);
  }

  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    return normalizeRole(candidate.role ?? candidate.name ?? candidate.code ?? candidate.slug);
  }

  if (typeof value === 'number') {
    return String(value).toUpperCase();
  }

  return '';
};

export const getRoleHomePage = (role?: unknown): string => {
  switch (normalizeRole(role)) {
    case 'ADMIN':
      return '/dashboard';
    case 'MANAGER':
      return '/dashboard';
    case 'FLEET_MANAGER':
      return '/fleet/dashboard';
    case 'ACCOUNTANT':
      return '/accountant/dashboard';
    case 'FINANCE_MANAGER':
      return '/fm/dashboard';
    case 'AUDITOR':
      return '/auditor/dashboard';
    case 'CLERK':
      return '/clerk/dashboard';
    case 'TYRE_INSPECTOR':
      return '/fleet/tyres';
    case 'PROJECT_ASSOCIATE':
    case 'PROJECT_ASSOCIATES':
      return '/dashboard';
    case 'DRIVER':
      return '/dashboard';
    case 'PUMP_OPERATOR':
      return '/pump/dashboard';
    default:
      return '/dashboard';
  }
};
