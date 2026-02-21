import { Router } from "express";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { getPrismaFromReq } from "../middlewares/prismaRequest";

const router = Router();
router.use(enforceTenant);

router.post("/", async (req, res) => {
    const prisma = getPrismaFromReq(req as TenantAwareRequest);
    const tool = await prisma.toolContract.create({ data: req.body });
    res.json(tool);
});

router.get("/", async (req, res) => {
    const prisma = getPrismaFromReq(req as TenantAwareRequest);
    const tools = await prisma.toolContract.findMany();
    res.json(tools);
});

export default router;
