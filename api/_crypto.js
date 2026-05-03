const crypto = require("crypto");

const FALLBACK_SECRET = "byok-local-development-secret-change-me";
const FALLBACK_SESSION_SECRET = "byok-local-development-session-secret";
const FALLBACK_VAULT_SECRET = "byok-local-development-vault-secret";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function secretFor(kind) {
  if (kind === "session") {
    return process.env.BYOK_SESSION_SECRET || process.env.BYOK_TOKEN_SECRET || FALLBACK_SESSION_SECRET;
  }
  if (kind === "vault") {
    return process.env.BYOK_VAULT_SECRET || process.env.BYOK_TOKEN_SECRET || FALLBACK_VAULT_SECRET;
  }
  return process.env.BYOK_TOKEN_SECRET || FALLBACK_SECRET;
}

function keyMaterial(kind = "grant") {
  const secret = secretFor(kind);
  if (process.env.VERCEL && !process.env.BYOK_TOKEN_SECRET && !process.env[`BYOK_${kind.toUpperCase()}_SECRET`]) {
    throw new Error(`missing_BYOK_${kind.toUpperCase()}_SECRET`);
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function sealJSON(payload, kind = "grant", aad = "") {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyMaterial(kind), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", base64url(iv), base64url(tag), base64url(ciphertext)].join(".");
}

function openJSON(code, kind = "grant", aad = "") {
  const parts = String(code || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("invalid_code");
  }
  const iv = fromBase64url(parts[1]);
  const tag = fromBase64url(parts[2]);
  const ciphertext = fromBase64url(parts[3]);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyMaterial(kind), iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

function sealGrant(payload) {
  return sealJSON(payload, "grant");
}

function openGrant(code) {
  return openJSON(code, "grant");
}

function encryptVaultSecret(value, aad) {
  return sealJSON({ value: String(value || "") }, "vault", aad);
}

function decryptVaultSecret(sealed, aad) {
  return openJSON(sealed, "vault", aad).value;
}

function sha256Base64url(value) {
  return base64url(crypto.createHash("sha256").update(value, "utf8").digest());
}

function normalizeProvider(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

module.exports = {
  FALLBACK_SECRET,
  base64url,
  decryptVaultSecret,
  encryptVaultSecret,
  openGrant,
  openJSON,
  sealGrant,
  sealJSON,
  sha256Base64url,
  normalizeProvider
};
