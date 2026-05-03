const { verifyAuthenticationResponse } = require("@simplewebauthn/server");
const { clearTransaction, readTransaction, setSession } = require("../_auth");
const { findUserByCredential, publicUser, readDB, writeDB } = require("../_db");
const { readBody, sendJSON } = require("../_http");
const { expectedOrigin, rpID, storedCredential } = require("../_webauthn");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "POST");
    return res.end("Method Not Allowed");
  }

  const tx = readTransaction(req);
  if (tx?.kind !== "passkey-login") return sendJSON(res, 400, { error: "missing_passkey_login" });

  const response = await readBody(req);
  const db = await readDB();
  const found = findUserByCredential(db, response.id);
  if (!found) return sendJSON(res, 404, { error: "passkey_not_found" });

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: tx.challenge,
    expectedOrigin: expectedOrigin(req),
    expectedRPID: rpID(req),
    credential: storedCredential(found.passkey),
    requireUserVerification: true
  });
  if (!verification.verified) return sendJSON(res, 400, { error: "passkey_not_verified" });

  found.passkey.counter = verification.authenticationInfo.newCounter;
  found.passkey.lastUsedAt = new Date().toISOString();
  found.user.updatedAt = new Date().toISOString();
  await writeDB(db);
  setSession(res, req, found.user.id);
  clearTransaction(res, req);
  return sendJSON(res, 200, { user: publicUser(found.user) });
};
