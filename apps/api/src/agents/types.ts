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
