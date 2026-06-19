import { Router } from "express";
import { queueSnapshot } from "@eiah/core/queue/snapshot";
import { renderCountersAsPrometheusText } from "../workers/imobWorkerMetrics";
import { renderImobIntakeCountersAsPrometheusText } from "../services/imob/intake/imobIntakeObservability";

export const metricsPromRouter = Router();

metricsPromRouter.get("/", async (_req, res) => {
  const queues = await queueSnapshot();

  let output = "";

  for (const [queueName, metric] of Object.entries(queues)) {
    for (const [field, value] of Object.entries(metric)) {
      if (typeof value === "object" && value !== null) {
        for (const [subField, subValue] of Object.entries(value)) {
          const key = `queue_${queueName}_${field}_${subField}`.replace(/[^a-z0-9_]/gi, "_");
          output += `${key} ${subValue}\n`;
        }
      } else {
        const key = `queue_${queueName}_${field}`.replace(/[^a-z0-9_]/gi, "_");
        output += `${key} ${value}\n`;
      }
    }
  }

  const imobCounters = renderCountersAsPrometheusText();
  if (imobCounters) {
    output += `\n# IMOB Worker Mutation counters\n${imobCounters}\n`;
  }

  const imobIntakeCounters = renderImobIntakeCountersAsPrometheusText();
  if (imobIntakeCounters) {
    output += `\n# IMOB Intake Pilot counters\n${imobIntakeCounters}\n`;
  }

  res.set("Content-Type", "text/plain");
  res.send(output);
});
