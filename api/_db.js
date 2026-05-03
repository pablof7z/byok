const fs = require("fs/promises");
const path = require("path");
const { get, put } = require("@vercel/blob");
const { decryptVaultSecret, encryptVaultSecret, normalizeProvider, openJSON, sealJSON } = require("./_crypto");

const DB_PATHNAME = "byok/db.json";
const LOCAL_DB_PATH = path.join(process.cwd(), ".local", "byok-db.json");
const BLOB_ACCESSES = new Set(["private", "public"]);

function emptyDB() {
  return { version: 1, users: [] };
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function isMissingBlobError(error) {
  const message = String(error?.message || "");
  return message.includes("Failed to fetch blob: 400") || message.includes("Failed to fetch blob: 404");
}

function isPublicStorePrivateAccessError(error) {
  const message = String(error?.message || "");
  return message.includes("Cannot use private access on a public store")
    || message.includes("must be configured with private access");
}

function blobWriteAccess() {
  const access = String(process.env.BYOK_BLOB_ACCESS || "private").trim().toLowerCase();
  if (!BLOB_ACCESSES.has(access)) throw new Error("invalid_BYOK_BLOB_ACCESS");
  return access;
}

async function readBlobByAccess(access, options = {}) {
  const blob = await get(DB_PATHNAME, { access, ...options });
  if (blob?.statusCode !== 200) return null;
  return openJSON(await streamToString(blob.stream), "vault", "byok-db");
}

async function readBlobDB() {
  let privateReadError = null;
  try {
    const db = await readBlobByAccess("private", { useCache: false });
    if (db) return db;
  } catch (error) {
    privateReadError = error;
  }

  try {
    const db = await readBlobByAccess("public");
    if (db) return db;
  } catch (error) {
    if (!isMissingBlobError(error)) throw error;
  }

  if (
    privateReadError
    && !isMissingBlobError(privateReadError)
    && !isPublicStorePrivateAccessError(privateReadError)
  ) {
    throw privateReadError;
  }
  return emptyDB();
}

async function readDB() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      return await readBlobDB();
    } catch (error) {
      if (isMissingBlobError(error)) return emptyDB();
      throw error;
    }
  }

  try {
    return JSON.parse(await fs.readFile(LOCAL_DB_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return emptyDB();
    throw error;
  }
}

async function writeDB(db) {
  db.version = 1;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const body = sealJSON(db, "vault", "byok-db");
    const access = blobWriteAccess();
    const options = {
      access,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "text/plain"
    };

    try {
      await put(DB_PATHNAME, body, options);
    } catch (error) {
      if (access !== "private" || !isPublicStorePrivateAccessError(error)) throw error;
      await put(DB_PATHNAME, body, { ...options, access: "public" });
    }
    return;
  }

  await fs.mkdir(path.dirname(LOCAL_DB_PATH), { recursive: true });
  await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(db, null, 2));
}

function nowISO() {
  return new Date().toISOString();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    providers: user.providers || [],
    passkeyCount: (user.passkeys || []).length,
    keys: (user.keys || []).map(key => ({
      id: key.id,
      provider: key.provider,
      label: key.label,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt
    })),
    grants: (user.grants || []).map(grant => ({
      id: grant.id,
      provider: grant.provider,
      keyID: grant.keyID,
      keyLabel: grant.keyLabel,
      clientID: grant.clientID,
      appName: grant.appName,
      createdAt: grant.createdAt
    }))
  };
}

function findUser(db, id) {
  return db.users.find(user => user.id === id);
}

function findUserByEmail(db, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return db.users.find(user => user.email?.toLowerCase() === normalized) || null;
}

function findUserByProvider(db, provider, subject) {
  return db.users.find(user => (user.providers || []).some(item => item.provider === provider && item.subject === subject)) || null;
}

function findUserByCredential(db, credentialID) {
  for (const user of db.users) {
    const passkey = (user.passkeys || []).find(item => item.id === credentialID);
    if (passkey) return { user, passkey };
  }
  return null;
}

function createUser({ email, name, avatar }) {
  const now = nowISO();
  return {
    id: cryptoRandomID(),
    email: String(email || "").trim().toLowerCase(),
    name: String(name || email || "BYOK User").trim(),
    avatar: avatar || "",
    providers: [],
    passkeys: [],
    keys: [],
    grants: [],
    createdAt: now,
    updatedAt: now
  };
}

function upsertOAuthUser(db, provider, profile) {
  let user = findUserByProvider(db, provider, profile.subject);
  if (!user && profile.email) user = findUserByEmail(db, profile.email);
  if (!user) {
    user = createUser(profile);
    db.users.push(user);
  }
  user.email = user.email || String(profile.email || "").toLowerCase();
  user.name = profile.name || user.name;
  user.avatar = profile.avatar || user.avatar || "";
  user.providers = user.providers || [];
  const existing = user.providers.find(item => item.provider === provider && item.subject === profile.subject);
  if (existing) {
    existing.email = profile.email || existing.email || "";
    existing.name = profile.name || existing.name || "";
    existing.avatar = profile.avatar || existing.avatar || "";
  } else {
    user.providers.push({
      provider,
      subject: profile.subject,
      email: profile.email || "",
      name: profile.name || "",
      avatar: profile.avatar || "",
      createdAt: nowISO()
    });
  }
  user.updatedAt = nowISO();
  return user;
}

function upsertAPIKey(user, input) {
  const provider = normalizeProvider(input.provider);
  const value = String(input.api_key || input.value || "").trim();
  const label = String(input.label || "Default").trim() || "Default";
  if (!provider || !value) throw new Error("invalid_key");

  const id = input.id || cryptoRandomID();
  const now = nowISO();
  const existing = (user.keys || []).find(key => key.id === id);
  const aad = `user:${user.id}:key:${id}:provider:${provider}`;
  const encryptedValue = encryptVaultSecret(value, aad);
  if (existing) {
    existing.provider = provider;
    existing.label = label;
    existing.encryptedValue = encryptedValue;
    existing.updatedAt = now;
    return existing;
  }

  const key = { id, provider, label, encryptedValue, createdAt: now, updatedAt: now };
  user.keys = [...(user.keys || []), key].sort((a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label));
  user.updatedAt = now;
  return key;
}

function decryptAPIKey(user, key) {
  const aad = `user:${user.id}:key:${key.id}:provider:${key.provider}`;
  return decryptVaultSecret(key.encryptedValue, aad);
}

function recordGrant(user, key, input) {
  const grant = {
    id: cryptoRandomID(),
    provider: key.provider,
    keyID: key.id,
    keyLabel: key.label,
    clientID: String(input.client_id || ""),
    appName: String(input.app_name || input.client_id || "Unknown app"),
    createdAt: nowISO()
  };
  user.grants = [grant, ...(user.grants || [])].slice(0, 500);
  user.updatedAt = nowISO();
  return grant;
}

function cryptoRandomID() {
  return require("crypto").randomUUID();
}

module.exports = {
  createUser,
  decryptAPIKey,
  emptyDB,
  findUser,
  findUserByCredential,
  findUserByEmail,
  findUserByProvider,
  nowISO,
  publicUser,
  readDB,
  recordGrant,
  upsertAPIKey,
  upsertOAuthUser,
  writeDB
};
