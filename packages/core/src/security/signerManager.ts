import crypto from "node:crypto";
import { VaultSigner } from "./vaultSigner";

export type SignerAlgorithm = "ed25519" | "external";

export type SignContext = {
  tenantId: string;
  workspaceId?: string | null;
  runId?: string;
  actionHash: string;
  tenantHash: string;
  nonce: string;
  timestamp: string;
  riskLevel?: string;
};

export type SignatureResult = {
  signature: string; // base64
  algorithm: SignerAlgorithm;
  keyId: string;
};

export interface Signer {
  algorithm: SignerAlgorithm;
  sign(hashHex: string, context: SignContext): Promise<SignatureResult>;
}

/**
 * 🔐 Assinador local (para desenvolvimento e testes)
 * Gera par de chaves Ed25519 por tenant em memória.
 * NÃO deve ser usado em produção.
 */
class LocalEd25519Signer implements Signer {
  algorithm: SignerAlgorithm = "ed25519";

  private readonly keysByTenant = new Map<string, { privateKey: crypto.KeyObject; keyId: string }>();

  async sign(hashHex: string, context: SignContext): Promise<SignatureResult> {
    let entry = this.keysByTenant.get(context.tenantId);
    if (!entry) {
      const { privateKey } = crypto.generateKeyPairSync("ed25519");
      entry = {
        privateKey,
        keyId: `local-ed25519:${context.tenantId}`,
      };
      this.keysByTenant.set(context.tenantId, entry);
    }

    const signature = crypto.sign(null, Buffer.from(hashHex, "hex"), entry.privateKey);
    return {
      signature: signature.toString("base64"),
      algorithm: this.algorithm,
      keyId: entry.keyId,
    };
  }
}

/**
 * 🌐 Assinador HTTP genérico (para integrações externas simples)
 * Usa POST JSON → { hashHex, context }
 */
class HttpSigner implements Signer {
  algorithm: SignerAlgorithm = "external";

  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
    private readonly headers: Record<string, string>
  ) { }

  async sign(hashHex: string, context: SignContext): Promise<SignatureResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({
          hashHex,
          context,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Signer HTTP ${response.status}: ${body}`);
      }

      const payload = (await response.json()) as Record<string, unknown>;

      const signature =
        (typeof payload.signature === "string" && payload.signature) ||
        (typeof payload.signatureBase64 === "string" && payload.signatureBase64) ||
        null;
      const keyId = (typeof payload.keyId === "string" && payload.keyId) || "external";

      if (!signature) {
        throw new Error("Signer response missing signature");
      }

      return {
        signature,
        algorithm: this.algorithm,
        keyId,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * 🧠 Gerenciador unificado de signers (Local / HTTP / Vault)
 */
export class SignerManager {
  constructor(private readonly signer: Signer) { }

  static fromEnv(): SignerManager {
    const provider = (process.env.SIGNER_PROVIDER ?? "local").trim().toLowerCase();
    const signerRequired = (() => {
      const raw = process.env.SIGNER_REQUIRED;
      if (!raw) return false;
      const normalized = raw.trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "on";
    })();

    // 🔐 VaultSigner (custódia segura via HSM/Vault)
    if (provider === "vault") {
      const url = process.env.SIGNER_VAULT_URL;
      const token = process.env.SIGNER_VAULT_TOKEN;
      if (!url || !token) {
        throw new Error("SIGNER_PROVIDER=vault requires SIGNER_VAULT_URL and SIGNER_VAULT_TOKEN");
      }

      const timeoutMs = Number(process.env.SIGNER_VAULT_TIMEOUT_MS ?? "2000");
      const resolvedTimeout = Number.isFinite(timeoutMs) ? timeoutMs : 2000;
      const vaultSigner = new VaultSigner(url, token, resolvedTimeout);

      // Adaptador para o padrão Signer
      return new SignerManager({
        algorithm: "external",
        sign: (hashHex, context) => vaultSigner.sign(hashHex, context as any),
      });
    }

    if (signerRequired) {
      throw new Error("SIGNER_REQUIRED=true requires SIGNER_PROVIDER=vault");
    }

    // 🌍 HTTP signer genérico
    if (provider === "http") {
      const url = process.env.SIGNER_HTTP_URL;
      if (!url) {
        throw new Error("SIGNER_PROVIDER=http requires SIGNER_HTTP_URL");
      }

      const timeoutMs = Number(process.env.SIGNER_HTTP_TIMEOUT_MS ?? "2000");
      const headersJson = process.env.SIGNER_HTTP_HEADERS_JSON ?? "{}";
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(headersJson) as Record<string, string>;
      } catch {
        throw new Error("SIGNER_HTTP_HEADERS_JSON must be valid JSON");
      }

      return new SignerManager(
        new HttpSigner(url, Number.isFinite(timeoutMs) ? timeoutMs : 2000, headers)
      );
    }

    // 🧩 Local signer (modo desenvolvimento)
    return new SignerManager(new LocalEd25519Signer());
  }

  async signCriticalHash(params: { hashHex: string; context: SignContext }): Promise<SignatureResult> {
    return this.signer.sign(params.hashHex, params.context);
  }

  get algorithm() {
    return this.signer.algorithm;
  }
}
