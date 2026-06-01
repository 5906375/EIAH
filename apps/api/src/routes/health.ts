import type { Request, Response } from "express";
import { collectPublicHealth } from "../services/health";

export function createPublicHealthHandler(params?: {
  collect?: typeof collectPublicHealth;
}) {
  return async (_req: Request, res: Response) => {
    const report = await (params?.collect ?? collectPublicHealth)();
    res.status(report.status === "healthy" ? 200 : 503).json(report);
  };
}
