import type { RegisteredAction } from "../actionRegistry";

export type ActionDefinition = RegisteredAction;

export interface VersionedActionContract {
  version: string;
  actions: Record<string, ActionDefinition>;
}

export class VersionedActionRegistry {
  constructor(private readonly defaultVersion: string = "default") {}

  private readonly versions = new Map<string, VersionedActionContract>();

  registerVersion(contract: VersionedActionContract) {
    const version = contract.version.trim();
    if (!version) {
      throw new Error("Version name cannot be empty");
    }
    this.versions.set(version, {
      version,
      actions: { ...contract.actions },
    });
  }

  /**
   * Resolve the configured version, falling back to the default when possible.
   */
  resolveVersion(version?: string | null) {
    if (version && this.versions.has(version)) {
      return version;
    }
    if (this.versions.has(this.defaultVersion)) {
      return this.defaultVersion;
    }
    return version ?? null;
  }

  getActionsForVersion(version?: string | null) {
    const resolved = this.resolveVersion(version);
    if (!resolved) {
      return null;
    }
    return this.versions.get(resolved)?.actions ?? null;
  }

  getVersionContract(version?: string | null): VersionedActionContract | null {
    const resolved = this.resolveVersion(version);
    if (!resolved) {
      return null;
    }
    const contract = this.versions.get(resolved);
    if (!contract) return null;
    return {
      version: contract.version,
      actions: { ...contract.actions },
    };
  }

  listVersions() {
    return [...this.versions.keys()];
  }

  snapshot(): VersionedActionContract[] {
    return this.listVersions()
      .map((version) => this.getVersionContract(version))
      .filter((contract): contract is VersionedActionContract => Boolean(contract));
  }
}
