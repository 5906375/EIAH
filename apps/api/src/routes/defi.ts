import { Router } from "express";
import { z } from "zod";
import { requireIdempotency } from "../middlewares/auth";
import { enforceTenant } from "../middlewares/enforceTenant";

export const defiRouter = Router();
defiRouter.use(enforceTenant);

const DeFiSimulateRequest = z.object({
  chainId: z.number().int(),
  to: z.string().min(1),
  abiFragment: z.string().min(1),
  args: z.array(z.any()).default([]),
  valueWei: z.string().nullable().optional(),
});

const DeFiMintRequest = DeFiSimulateRequest.extend({
  confirmationId: z.string().min(1),
});

defiRouter.post("/defi1/simulate-mint", async (req, res) => {
  const parse = DeFiSimulateRequest.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid body",
        details: parse.error.flatten(),
      },
    });
  }

  const { chainId, to, abiFragment, args, valueWei } = parse.data;

  // TODO: chamar simulador (ex: viem/publicClient.simulateContract)
  const gasEstimate = "120000";
  const calldata = "0x40c10f190000000000000000...";

  return res.json({
    ok: true,
    data: { gasEstimate, calldata },
    meta: {
      traceId: req.header("x-request-id") ?? "trc-sim",
      tookMs: 87,
    },
  });
});

// POST /defi1/mint (idempotente)
defiRouter.post("/defi1/mint", requireIdempotency, async (req, res) => {
  const parse = DeFiMintRequest.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid body",
        details: parse.error.flatten(),
      },
    });
  }

  const { chainId, to, abiFragment, args, valueWei, confirmationId } = parse.data;

  // TODO: validar confirmationId (guardrail), enviar tx (ex: viem/walletClient.writeContract)
  const txHash = "0xabc...789";
  const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;

  return res.json({
    ok: true,
    data: { txHash, explorerUrl },
    meta: {
      traceId: req.header("x-request-id") ?? "trc-mint",
      tookMs: 512,
    },
  });
});
