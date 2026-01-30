import { Router } from "express";
import { prisma } from "@repo/db";

const router = Router();

router.post("/", async (req, res) => {
    const tool = await prisma.toolContract.create({ data: req.body });
    res.json(tool);
});

router.get("/", async (req, res) => {
    const tools = await prisma.toolContract.findMany();
    res.json(tools);
});

export default router;
