const { sealGrant, normalizeProvider } = require("./_crypto");
const { requireUser } = require("./_auth");
const { decryptAPIKey, publicUser, readDB, recordGrant, writeDB } = require("./_db");
const { readBody } = require("./_http");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "https://byok.f7z.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end("Method Not Allowed");
  }

  try {
    const sessionUser = await requireUser(req, res);
    if (!sessionUser) return;

    const body = await readBody(req);
    const provider = normalizeProvider(body.provider);
    const clientID = String(body.client_id || "");
    const redirectURI = String(body.redirect_uri || "");
    const codeChallenge = String(body.code_challenge || "");
    const method = String(body.code_challenge_method || "S256").toUpperCase();

    if (!provider || !body.key_id || !clientID || !redirectURI || !codeChallenge) {
      res.statusCode = 400;
      return res.json({ error: "invalid_request" });
    }
    if (method !== "S256" && method !== "PLAIN") {
      res.statusCode = 400;
      return res.json({ error: "unsupported_code_challenge_method" });
    }

    const db = await readDB();
    const user = db.users.find(item => item.id === sessionUser.id);
    const storedKey = user?.keys?.find(key => key.id === body.key_id && key.provider === provider);
    if (!user || !storedKey) {
      res.statusCode = 404;
      return res.json({ error: "key_not_found" });
    }

    const key = decryptAPIKey(user, storedKey);
    recordGrant(user, storedKey, body);
    await writeDB(db);

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://byok.f7z.io",
      aud: "byok-token",
      iat: now,
      exp: now + 180,
      provider,
      api_key: key,
      key_id: storedKey.id,
      key_label: storedKey.label,
      client_id: clientID,
      app_name: String(body.app_name || clientID),
      redirect_uri: redirectURI,
      state: String(body.state || ""),
      code_challenge: codeChallenge,
      code_challenge_method: method
    };

    res.statusCode = 200;
    return res.json({
      code: sealGrant(payload),
      expires_in: 180,
      user: publicUser(user)
    });
  } catch (error) {
    res.statusCode = 400;
    return res.json({ error: error.message || "invalid_request" });
  }
};
