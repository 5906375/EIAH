import { createGovernedRouter } from "../middlewares/asyncHandler";
import { resolveChatVerticalImobRuntimeShadowEngineState } from "../resolvers/chatVerticalImobRuntimeShadowEngine";

export const CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH = "/imob/chat/runtime-shadow-state" as const;

/**
 * Shadow/read-only IMOB runtime state route. Delegates entirely to
 * resolveChatVerticalImobRuntimeShadowEngineState(), which never throws and
 * always returns a valid chat.vertical_runtime_shadow_state.v1 payload
 * (falling back to a blocked state for any malformed request). sideEffects
 * is always 0: no DB write, no external network call, no run/conversation
 * created, no entitlement/RBAC/policy evaluation beyond what the request
 * body already carries as synthetic governance decisions.
 *
 * This router is intentionally NOT mounted in apps/api/src/index.ts in this
 * PR: it exists as a contract-tested, isolated route/controller, not yet a
 * live/reachable endpoint of the running API. Mounting it is a decision for
 * a later PR.
 */
export const chatVerticalImobRuntimeShadowRouter = createGovernedRouter();

chatVerticalImobRuntimeShadowRouter.post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH, async (req, res) => {
  const state = resolveChatVerticalImobRuntimeShadowEngineState(req.body);
  res.status(200).json(state);
});
