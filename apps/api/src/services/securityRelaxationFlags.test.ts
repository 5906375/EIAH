import assert from "node:assert/strict";
import test from "node:test";
import {
  allowEmailPasswordReset,
  allowGuardrailWarnOnly,
  allowPasswordBootstrap,
  allowUnverifiedWallet,
  listEnabledSecurityRelaxations,
  resolveGuardrailBlockMode,
  warnEnabledSecurityRelaxations,
  type SecurityRelaxationEnvKey,
} from "./securityRelaxationFlags";

type RelaxationCase = {
  label: string;
  key: SecurityRelaxationEnvKey;
  enabled: typeof allowUnverifiedWallet;
};

const relaxationCases: RelaxationCase[] = [
  {
    label: "unverified wallet",
    key: "EIAH_ALLOW_UNVERIFIED_WALLET",
    enabled: allowUnverifiedWallet,
  },
  {
    label: "password bootstrap",
    key: "EIAH_ALLOW_PASSWORD_BOOTSTRAP",
    enabled: allowPasswordBootstrap,
  },
  {
    label: "email password reset",
    key: "EIAH_ALLOW_EMAIL_PASSWORD_RESET",
    enabled: allowEmailPasswordReset,
  },
  {
    label: "guardrail warn-only",
    key: "EIAH_ALLOW_GUARDRAIL_WARN_ONLY",
    enabled: allowGuardrailWarnOnly,
  },
];

for (const relaxation of relaxationCases) {
  test(`${relaxation.label}: absent flag remains strict`, () => {
    assert.equal(relaxation.enabled({}), false);
  });

  test(`${relaxation.label}: exact true enables the relaxation`, () => {
    assert.equal(relaxation.enabled({ [relaxation.key]: "true" }), true);
  });

  test(`${relaxation.label}: variants remain strict`, () => {
    for (const value of ["TRUE", "1", "yes", ""]) {
      assert.equal(relaxation.enabled({ [relaxation.key]: value }), false, value);
    }
  });

  test(`${relaxation.label}: exact true prevails in NODE_ENV=production`, () => {
    assert.equal(
      relaxation.enabled({ NODE_ENV: "production", [relaxation.key]: "true" }),
      true,
    );
  });
}

test("guardrail mode is block unless warn-only is explicitly enabled", () => {
  assert.equal(resolveGuardrailBlockMode({}), "block");
  assert.equal(resolveGuardrailBlockMode({ EIAH_ALLOW_GUARDRAIL_WARN_ONLY: "TRUE" }), "block");
  assert.equal(resolveGuardrailBlockMode({ EIAH_ALLOW_GUARDRAIL_WARN_ONLY: "true" }), "warn");
});

test("bootstrap warning inventory includes only exact true flags", () => {
  assert.deepEqual(
    listEnabledSecurityRelaxations({
      EIAH_ALLOW_UNVERIFIED_WALLET: "true",
      EIAH_ALLOW_PASSWORD_BOOTSTRAP: "TRUE",
      EIAH_ALLOW_EMAIL_PASSWORD_RESET: "1",
      EIAH_ALLOW_GUARDRAIL_WARN_ONLY: "yes",
    }),
    ["EIAH_ALLOW_UNVERIFIED_WALLET"],
  );
});

test("production relaxation emits a bootstrap warn", () => {
  const warnings: Array<{ flag: SecurityRelaxationEnvKey; message: string }> = [];
  warnEnabledSecurityRelaxations(
    {
      warn(bindings, message) {
        warnings.push({ flag: bindings.flag, message });
      },
    },
    { NODE_ENV: "production", EIAH_ALLOW_UNVERIFIED_WALLET: "true" },
  );
  assert.deepEqual(warnings, [
    {
      flag: "EIAH_ALLOW_UNVERIFIED_WALLET",
      message: "security.relaxation_enabled",
    },
  ]);
});
