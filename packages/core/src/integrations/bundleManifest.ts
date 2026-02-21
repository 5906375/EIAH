import fs from "node:fs";
import { z } from "zod";

const ToolContractSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  executor: z.enum(["http", "db", "web3", "fs"]),
  trustLevel: z.number().int().min(0).max(100).optional(),
  inputSchema: z.union([z.record(z.any()), z.boolean()]).optional(),
  outputSchema: z.union([z.record(z.any()), z.boolean()]).optional(),
});

const DriverOperationSchema = z.object({
  operation: z.string().min(1),
  action: z.string().min(1),
  executor: z.enum(["http", "db", "web3", "fs"]),
  featureFlag: z.string().min(1).optional(),
  toolContract: ToolContractSchema.optional(),
});

const BundleDriverSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  operations: z.array(DriverOperationSchema).min(1),
});

const BundleManifestSchema = z.object({
  bundleId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  drivers: z.array(BundleDriverSchema).min(1),
});

export type BundleManifest = z.infer<typeof BundleManifestSchema>;
export type BundleDriverOperation = z.infer<typeof DriverOperationSchema>;

export type ToolContractAdapter = {
  name: string;
  version: string;
  tenantId: string;
  executor: "http" | "db" | "web3" | "fs";
  trustLevel: number;
  inputSchema: Record<string, unknown> | boolean;
  outputSchema?: Record<string, unknown> | boolean;
  metadata: {
    bundleId: string;
    bundleVersion: string;
    driverId: string;
    operation: string;
    enabled: boolean;
    featureFlag?: string;
  };
};

function parseFeatureFlag(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

function isEnabledByFeatureFlag(flagName: string | undefined) {
  if (!flagName) return true;
  return parseFeatureFlag(process.env[flagName]);
}

export function loadBundleManifestFromFile(pathname: string): BundleManifest {
  const raw = fs.readFileSync(pathname, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return BundleManifestSchema.parse(parsed);
}

export function buildToolContractAdapters(params: {
  manifest: BundleManifest;
  tenantId: string;
  defaultTrustLevel?: number;
}) {
  const defaultTrustLevel = params.defaultTrustLevel ?? 70;
  const adapters: ToolContractAdapter[] = [];

  for (const driver of params.manifest.drivers) {
    for (const operation of driver.operations) {
      if (!operation.toolContract) continue;
      adapters.push({
        name: operation.toolContract.name,
        version: operation.toolContract.version,
        tenantId: params.tenantId,
        executor: operation.toolContract.executor,
        trustLevel: operation.toolContract.trustLevel ?? defaultTrustLevel,
        inputSchema: operation.toolContract.inputSchema ?? { type: "object", additionalProperties: true },
        outputSchema: operation.toolContract.outputSchema,
        metadata: {
          bundleId: params.manifest.bundleId,
          bundleVersion: params.manifest.version,
          driverId: driver.id,
          operation: operation.operation,
          enabled: isEnabledByFeatureFlag(operation.featureFlag),
          featureFlag: operation.featureFlag,
        },
      });
    }
  }

  return adapters;
}
