import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AiProvider } from "@/lib/ai/config";
import { AppError } from "@/lib/errors";

function encryptionKey() {
  const encoded = process.env.API_KEY_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || Buffer.from(encoded, "base64").length !== 32)
    throw new AppError(
      "CONFIGURATION",
      "Set API_KEY_ENCRYPTION_KEY to a base64-encoded random 32-byte key on the server.",
      503,
    );
  return Buffer.from(encoded, "base64");
}
export function encryptionReady() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}
export function encryptApiKey(provider: AiProvider, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`jev-trading:api-key:v1:${provider}`));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}
export function decryptApiKey(provider: AiProvider, encrypted: string) {
  const key = encryptionKey();
  try {
    const [version, nonce, authenticationTag, payload, extra] = encrypted.split(":");
    if (version !== "v1" || !nonce || !authenticationTag || !payload || extra !== undefined)
      throw new Error();
    const iv = Buffer.from(nonce, "base64");
    const tag = Buffer.from(authenticationTag, "base64");
    const ciphertext = Buffer.from(payload, "base64");
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > 512)
      throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(`jev-trading:api-key:v1:${provider}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError(
      "KEY_DECRYPTION",
      "The saved API key cannot be decrypted. Restore API_KEY_ENCRYPTION_KEY or replace the saved key.",
      503,
    );
  }
}
