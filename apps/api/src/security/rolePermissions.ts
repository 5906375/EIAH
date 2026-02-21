export function resolveEffectivePermissions(params: {
  systemPermissions: string[];
  customPermissions?: string[] | null;
}) {
  const custom = params.customPermissions ?? null;
  if (custom && custom.length > 0) return custom;
  return params.systemPermissions;
}
