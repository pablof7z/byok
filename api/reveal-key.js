const { requireUser } = require("./_auth");
const { decryptAPIKey, publicUser, readDB } = require("./_db");
const { readBody, sendJSON } = require("./_http");

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "POST");
    return res.end("Method Not Allowed");
  }

  const sessionUser = await requireUser(req, res);
  if (!sessionUser) return;

  try {
    const body = await readBody(req);
    const keyID = String(body.id || "");
    if (!keyID) return sendJSON(res, 400, { error: "invalid_key" });

    const db = await readDB();
    const user = db.users.find(item => item.id === sessionUser.id);
    if (!user) return sendJSON(res, 401, { error: "unauthorized" });

    const key = (user.keys || []).find(item => item.id === keyID);
    if (!key) return sendJSON(res, 404, { error: "key_not_found" });

    return sendJSON(res, 200, {
      api_key: decryptAPIKey(user, key),
      key: {
        id: key.id,
        provider: key.provider,
        label: key.label
      },
      user: publicUser(user)
    });
  } catch (error) {
    return sendJSON(res, 400, { error: error.message || "key_reveal_failed" });
  }
};
