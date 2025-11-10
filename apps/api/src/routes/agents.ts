import { Router } from "express";
import { enforceTenant } from "../middlewares/enforceTenant";
import { listAgents } from "../services/agents";

export const agentsRouter = Router();
agentsRouter.use(enforceTenant);

agentsRouter.get("/agents", async (_req, res) => {
  const items = await listAgents();
  return res.json({ items });
});

// Os endpoints de CRUD completo podem ser implementados depois (create/update/delete)
