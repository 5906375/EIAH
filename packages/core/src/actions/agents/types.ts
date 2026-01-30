export type AgentProfileSeed = {
  id?: string;
  agent: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: Array<Record<string, unknown>>;
  metadata?: unknown;
};

import type { ActionHandler } from "../actionRegistry";

/** Wrap a static AgentProfileSeed into an ActionHandler output. */
export function profileAction(profile: AgentProfileSeed): ActionHandler {
  return async () => ({
    status: "success",
    output: profile,
  });
}

export type { ActionHandler };
