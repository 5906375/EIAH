export class TenantPolicyStore {
  private static instance: TenantPolicyStore | null = null;

  static getInstance() {
    if (!TenantPolicyStore.instance) {
      TenantPolicyStore.instance = new TenantPolicyStore();
    }
    return TenantPolicyStore.instance;
  }

  async isScopeAllowed(_tenantId: string, _workspaceId: string, _scope: string) {
    // Default allow until policies are enforced.
    return true;
  }
}
