import crypto from "node:crypto";

export class VaultSigner {
  algorithm = "external" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 2000
  ) {}

  async sign(hashHex: string, context: Record<string, any>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/v1/eiah/sign`, {
        method: "POST",
        headers: {
          "X-Vault-Token": this.token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ hash: hashHex, context }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Vault signer error ${res.status}`);
      }
      const data = await res.json();
      return {
        signature: data.signature,
        algorithm: this.algorithm,
        keyId: data.key_id ?? "vault",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/v1/sys/health`, {
        method: "GET",
        headers: {
          "X-Vault-Token": this.token,
          "content-type": "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        return { ok: false, status: `vault:${res.status}` };
      }

      return { ok: true, status: "vault:ok" };
    } catch (error) {
      return { ok: false, status: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }
}
