const { currentUser } = require("./_auth");
const { providers } = require("./_providers");
const { publicUser } = require("./_db");
const { sendJSON } = require("./_http");

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("allow", "GET");
    return res.end("Method Not Allowed");
  }
  const user = await currentUser(req);
  return sendJSON(res, 200, {
    user: user ? publicUser(user) : null,
    providers
  });
};
