const { clearTransaction, readTransaction, setSession } = require("../../_auth");
const { publicOrigin, redirect } = require("../../_http");
const { readDB, upsertOAuthUser, writeDB } = require("../../_db");

module.exports = async function handler(req, res) {
  const origin = publicOrigin(req);
  const url = new URL(req.url, origin);
  const tx = readTransaction(req);
  if (tx?.kind !== "oauth" || tx.provider !== "github" || tx.state !== url.searchParams.get("state")) {
    return redirect(res, "/?error=invalid_oauth_state");
  }
  const code = url.searchParams.get("code");
  if (!code) return redirect(res, "/?error=missing_oauth_code");
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return redirect(res, "/?error=missing_github_oauth");

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/github/callback`
    })
  });
  if (!tokenResponse.ok) return redirect(res, "/?error=github_token_failed");
  const token = await tokenResponse.json();
  const headers = {
    authorization: `Bearer ${token.access_token}`,
    accept: "application/vnd.github+json",
    "user-agent": "byok.f7z.io"
  };
  const [profileResponse, emailsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers })
  ]);
  if (!profileResponse.ok) return redirect(res, "/?error=github_profile_failed");
  const profile = await profileResponse.json();
  const emails = emailsResponse.ok ? await emailsResponse.json() : [];
  const primary = Array.isArray(emails) ? emails.find(email => email.primary && email.verified) || emails.find(email => email.verified) : null;

  const db = await readDB();
  const user = upsertOAuthUser(db, "github", {
    subject: String(profile.id),
    email: primary?.email || profile.email || "",
    name: profile.name || profile.login,
    avatar: profile.avatar_url || ""
  });
  await writeDB(db);
  setSession(res, req, user.id);
  clearTransaction(res, req);
  return redirect(res, tx.returnTo || "/");
};
