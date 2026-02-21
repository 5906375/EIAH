import { describe, expect, it } from "vitest";
import {
  canActivateAgentInstall,
  canActivateConnector,
  enforceNotLastAdmin,
  maskVaultSecretRef,
  validateAllowedResources,
  validateLimits,
} from "../services/tenantGovernance";

describe("tenant governance helpers", () => {
  it("validates allowed resources", () => {
    expect(validateAllowedResources([])).toBe(false);
    expect(validateAllowedResources(["a"])).toBe(true);
    expect(validateAllowedResources({})).toBe(false);
    expect(validateAllowedResources({ read: true })).toBe(true);
  });

  it("validates limits", () => {
    expect(validateLimits({})).toBe(false);
    expect(validateLimits({ rpm: 0 })).toBe(false);
    expect(validateLimits({ rpm: 10, burst: 20 })).toBe(true);
  });

  it("enforces connector activation rules", () => {
    expect(
      canActivateConnector({
        role: "TENANT_OPERATOR",
        vaultSecretRef: "vault://tenants/a/connectors/x",
        allowedResources: ["read"],
        limits: { rpm: 10 },
      }).ok
    ).toBe(false);

    expect(
      canActivateConnector({
        role: "TENANT_ADMIN",
        vaultSecretRef: "",
        allowedResources: ["read"],
        limits: { rpm: 10 },
      }).ok
    ).toBe(false);

    expect(
      canActivateConnector({
        role: "TENANT_ADMIN",
        vaultSecretRef: "vault://tenants/a/connectors/x",
        allowedResources: ["read"],
        limits: { rpm: 10 },
      }).ok
    ).toBe(true);
  });

  it("enforces agent install activation rules", () => {
    expect(
      canActivateAgentInstall({
        role: "TENANT_ADMIN",
        dependenciesOk: false,
      }).ok
    ).toBe(false);

    expect(
      canActivateAgentInstall({
        role: "TENANT_ADMIN",
        dependenciesOk: true,
      }).ok
    ).toBe(true);
  });

  it("protects last admin", () => {
    const memberships = [
      { userId: "u1", role: "TENANT_ADMIN", status: "ACTIVE" },
      { userId: "u2", role: "TENANT_VIEWER", status: "ACTIVE" },
    ] as const;

    expect(enforceNotLastAdmin({ memberships, targetUserId: "u1" }).ok).toBe(false);
    expect(enforceNotLastAdmin({ memberships, targetUserId: "u2" }).ok).toBe(true);
  });

  it("masks vault secret refs", () => {
    expect(maskVaultSecretRef(null)).toBeNull();
    expect(maskVaultSecretRef("")).toBeNull();
    expect(maskVaultSecretRef("not-vault")).toBe("vault://***");
    expect(maskVaultSecretRef("vault://tenants/a/connectors/secret")).toBe(
      "vault://tenants/a/connectors/***"
    );
  });
});
