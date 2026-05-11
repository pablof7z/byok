const { sealGrant, normalizeProvider } = require("./_crypto");
const { requireUser } = require("./_auth");
const { decryptAPIKey, publicUser, readDB, recordGrant, writeDB } = require("./_db");
const { readBody } = require("./_http");

function uniqueSelections(input) {
  const raw = Array.isArray(input.selections) ? input.selections : null;
  const selections = raw || [{
    provider: input.provider,
    key_id: input.key_id
  }];
  const seen = new Set();
  return selections
    .map(item => ({
      provider: normalizeProvider(item?.provider),
      key_id: String(item?.key_id || "")
    }))
    .filter(item => {
      if (!item.provider || !item.key_id || seen.has(item.provider)) return false;
      seen.add(item.provider);
      return true;
    });
}

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
    const selections = uniqueSelections(body);
    const clientID = String(body.client_id || "");
    const redirectURI = String(body.redirect_uri || "");
    const codeChallenge = String(body.code_challenge || "");
    const method = String(body.code_challenge_method || "S256").toUpperCase();

    if (!selections.length || !clientID || !redirectURI || !codeChallenge) {
      res.statusCode = 400;
      return res.json({ error: "invalid_request" });
    }
    if (method !== "S256" && method !== "PLAIN") {
      res.statusCode = 400;
      return res.json({ error: "unsupported_code_challenge_method" });
    }

    const db = await readDB();
    const user = db.users.find(item => item.id === sessionUser.id);
    if (!user) {
      res.statusCode = 404;
      return res.json({ error: "key_not_found" });
    }

    const grantedProviders = [];
    for (const selection of selections) {
      const storedKey = user.keys?.find(key => key.id === selection.key_id && key.provider === selection.provider);
      if (!storedKey) {
        res.statusCode = 404;
        return res.json({ error: "key_not_found", provider: selection.provider });
      }

      const key = decryptAPIKey(user, storedKey);
      recordGrant(user, storedKey, body);
      grantedProviders.push({
        provider: storedKey.provider,
        api_key: key,
        key_id: storedKey.id,
        key_label: storedKey.label
      });
    }

    await writeDB(db);

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://byok.f7z.io",
      aud: "byok-token",
      iat: now,
      exp: now + 180,
      provider: grantedProviders[0].provider,
      api_key: grantedProviders[0].api_key,
      key_id: grantedProviders[0].key_id,
      key_label: grantedProviders[0].key_label,
      providers: grantedProviders,
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
      providers: grantedProviders.map(item => ({
        provider: item.provider,
        key_id: item.key_id,
        key_label: item.key_label
      })),
      user: publicUser(user)
    });
  } catch (error) {
    res.statusCode = 400;
    return res.json({ error: error.message || "invalid_request" });
  }
};
