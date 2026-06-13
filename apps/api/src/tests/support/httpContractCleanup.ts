import process from "node:process";

export function destroyResidualNetworkSockets(ports: number[]) {
  const handles = (process as any)._getActiveHandles?.() as unknown[] | undefined;
  if (!handles) return 0;

  let destroyed = 0;
  for (const handle of handles) {
    const remotePort = (handle as any)?.remotePort;
    const remoteAddress = (handle as any)?.remoteAddress;
    if (!ports.includes(remotePort) || remoteAddress !== "127.0.0.1") continue;

    if (typeof (handle as any)?.unref === "function") {
      (handle as any).unref();
    }
    if (typeof (handle as any)?.destroy === "function") {
      (handle as any).destroy();
      destroyed += 1;
    }
  }

  return destroyed;
}

export function hasOnlyStdIoHandles() {
  const resources = typeof (process as any).getActiveResourcesInfo === "function"
    ? (((process as any).getActiveResourcesInfo() as unknown[] | undefined) ?? [])
    : [];

  return resources.length > 0 && resources.every((resource) => resource === "PipeWrap");
}

export function finalizeHttpContractCleanup(ports: number[] = [5433, 6379]) {
  destroyResidualNetworkSockets(ports);
  if (hasOnlyStdIoHandles()) {
    setImmediate(() => process.exit(process.exitCode ?? 0));
  }
}
