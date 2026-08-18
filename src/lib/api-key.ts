import { createHash, randomBytes } from "node:crypto";

/** Prefix for live API keys — lets ops identify a key without revealing it. */
export const API_KEY_PREFIX = "fg_live_";

export {
  API_SCOPES,
  isApiScope,
  type ApiScope,
} from "@/lib/api-key-scopes";

/** SHA-256 hex digest of a key secret — the only thing stored at rest. */
export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** First 8 chars of the secret for display ("fg_live_ab12..."). */
export function keyPrefixFromSecret(secret: string): string {
  return secret.slice(0, Math.min(API_KEY_PREFIX.length + 8, secret.length));
}

/**
 * Generate a high-entropy API key secret. 32 random bytes → base64url
 * (~43 chars). The secret is returned exactly once at creation; only the
 * hash is persisted (owner decision, analysis v03 §9.5).
 */
export function generateApiKeySecret(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}
