const crypto = require("crypto");
const { publicOrigin, redirect, safeReturnTo } = require("../../_http");
const { setTransaction } = require("../../_auth");

module.exports = async function handler(req, res) {
  const clientID = process.env.GITHUB_CLIENT_ID;
  if (!clientID) return redirect(res, "/?error=missing_github_client_id");

  const origin = publicOrigin(req);
  const state = crypto.randomBytes(18).toString("base64url");
  const returnTo = safeReturnTo(new URL(req.url, origin).searchParams.get("return_to"));
  setTransaction(res, req, { kind: "oauth", provider: "github", state, returnTo });

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientID);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/github/callback`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return redirect(res, url.toString());
};
