const { openGrant, sha256Base64url } = require("./_crypto");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      const type = String(req.headers["content-type"] || "");
      try {
        if (type.includes("application/json")) {
          resolve(body ? JSON.parse(body) : {});
          return;
        }
        const params = new URLSearchParams(body);
        resolve(Object.fromEntries(params.entries()));
      } catch {
        reject(new Error("invalid_body"));
      }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
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
    const body = await readBody(req);
    if (body.grant_type && body.grant_type !== "authorization_code") {
      res.statusCode = 400;
      return res.json({ error: "unsupported_grant_type" });
    }

    const grant = openGrant(body.code);
    const now = Math.floor(Date.now() / 1000);
    if (!grant.exp || grant.exp < now) {
      res.statusCode = 400;
      return res.json({ error: "expired_code" });
    }
    if (String(body.client_id || "") !== grant.client_id || String(body.redirect_uri || "") !== grant.redirect_uri) {
      res.statusCode = 400;
      return res.json({ error: "invalid_client_or_redirect" });
    }

    const verifier = String(body.code_verifier || "");
    const expected = grant.code_challenge_method === "PLAIN" ? verifier : sha256Base64url(verifier);
    if (!verifier || expected !== grant.code_challenge) {
      res.statusCode = 400;
      return res.json({ error: "invalid_code_verifier" });
    }

    const providers = Array.isArray(grant.providers)
      ? grant.providers.filter(item => item?.provider && item?.api_key)
      : [];

    res.statusCode = 200;
    if (providers.length > 1) {
      return res.json({
        token_type: "raw_api_keys",
        providers: providers.map(item => ({
          provider: item.provider,
          api_key: item.api_key,
          key_id: item.key_id,
          key_label: item.key_label
        })),
        app_name: grant.app_name,
        issued_at: now
      });
    }

    return res.json({
      token_type: "raw_api_key",
      provider: providers[0]?.provider || grant.provider,
      api_key: providers[0]?.api_key || grant.api_key,
      key_id: providers[0]?.key_id || grant.key_id,
      key_label: providers[0]?.key_label || grant.key_label,
      app_name: grant.app_name,
      issued_at: now
    });
  } catch (error) {
    res.statusCode = 400;
    return res.json({ error: error.message || "invalid_grant" });
  }
};
