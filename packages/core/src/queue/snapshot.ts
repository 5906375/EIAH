import { probeRunQueue } from "./runQueue";
import { probeActionQueue } from "./actionQueue";
import { probeMaintenanceQueue } from "./maintenanceQueue";

/**
 * queueSnapshot()
 *
 * Retorna um snapshot completo das filas:
 * - waiting
 * - active
 * - completed
 * - failed
 * - dlqCount
 * - timestamp
 */
export async function queueSnapshot() {
  const [runQueue, actionQueue, maintenanceQueue] = await Promise.all([
    probeRunQueue(),
    probeActionQueue(),
    probeMaintenanceQueue(),
  ]);

  return {
    runQueue,
    actionQueue,
    maintenanceQueue,
    timestamp: Date.now(),
  };
}