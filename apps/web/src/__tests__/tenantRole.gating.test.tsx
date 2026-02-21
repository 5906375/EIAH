import React from "react";
import { render, screen } from "@testing-library/react";
import { canExecuteRuns, type TenantRole } from "@/lib/tenantRole";

function RunButton({ role }: { role: TenantRole }) {
  const disabled = !canExecuteRuns(role);
  return <button disabled={disabled}>Run</button>;
}

describe("tenant role gating", () => {
  const cases: Array<[TenantRole, boolean]> = [
    ["tenant_admin", false],
    ["tenant_operator", false],
    ["tenant_viewer", true],
  ];

  it.each(cases)("role %s => disabled=%s", (role, disabled) => {
    render(<RunButton role={role} />);
    const button = screen.getByRole("button", { name: "Run" });
    if (disabled) {
      expect(button).toBeDisabled();
    } else {
      expect(button).toBeEnabled();
    }
  });
});
