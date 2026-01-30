import { LLMProvider } from "./LLMProvider";

class LLMRegistry {
  private providers = new Map<string, LLMProvider>();

  register(provider: LLMProvider) {
    this.providers.set(provider.name, provider);
  }

  get(name: string): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider not found: ${name}`);
    }
    return provider;
  }

  has(name: string) {
    return this.providers.has(name);
  }
}

export const llmRegistry = new LLMRegistry();
