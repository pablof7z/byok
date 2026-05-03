const { requireUser } = require("./_auth");
const { publicUser, readDB, upsertAPIKey, writeDB } = require("./_db");
const { readBody, sendJSON } = require("./_http");

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const sessionUser = await requireUser(req, res);
  if (!sessionUser) return;

  const db = await readDB();
  const user = db.users.find(item => item.id === sessionUser.id);
  if (!user) return sendJSON(res, 401, { error: "unauthorized" });

  if (req.method === "GET") {
    return sendJSON(res, 200, { user: publicUser(user) });
  }

  if (req.method === "POST") {
    try {
      upsertAPIKey(user, await readBody(req));
      await writeDB(db);
      return sendJSON(res, 200, { user: publicUser(user) });
    } catch (error) {
      return sendJSON(res, 400, { error: error.message || "invalid_key" });
    }
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url, "http://localhost");
    const id = url.searchParams.get("id");
    user.keys = (user.keys || []).filter(key => key.id !== id);
    await writeDB(db);
    return sendJSON(res, 200, { user: publicUser(user) });
  }

  res.statusCode = 405;
  res.setHeader("allow", "GET, POST, DELETE");
  return res.end("Method Not Allowed");
};
