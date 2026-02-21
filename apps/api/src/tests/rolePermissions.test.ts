import { describe, expect, it } from "vitest";
import { resolveEffectivePermissions } from "../security/rolePermissions";

describe("resolveEffectivePermissions", () => {
  it("falls back to system permissions when custom is empty", () => {
    const system = ["a", "b"];
    expect(resolveEffectivePermissions({ systemPermissions: system, customPermissions: [] })).toEqual(system);
  });

  it("uses custom permissions when provided", () => {
    const system = ["a", "b"];
    const custom = ["x", "y"];
    expect(resolveEffectivePermissions({ systemPermissions: system, customPermissions: custom })).toEqual(
      custom
    );
  });
});
