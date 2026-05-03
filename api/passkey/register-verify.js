const { verifyRegistrationResponse } = require("@simplewebauthn/server");
const { clearTransaction, readTransaction, setSession } = require("../_auth");
const { createUser, findUser, publicUser, readDB, writeDB } = require("../_db");
const { readBody, sendJSON } = require("../_http");
const { expectedOrigin, rpID, toBase64url } = require("../_webauthn");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "POST");
    return res.end("Method Not Allowed");
  }

  const tx = readTransaction(req);
  if (tx?.kind !== "passkey-register") return sendJSON(res, 400, { error: "missing_passkey_registration" });

  const response = await readBody(req);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: tx.challenge,
    expectedOrigin: expectedOrigin(req),
    expectedRPID: rpID(req),
    requireUserVerification: true
  });
  if (!verification.verified) return sendJSON(res, 400, { error: "passkey_not_verified" });

  const db = await readDB();
  let user = findUser(db, tx.user.id);
  if (!user) {
    user = createUser(tx.user);
    user.id = tx.user.id;
    db.users.push(user);
  }

  const credential = verification.registrationInfo.credential;
  user.passkeys = user.passkeys || [];
  if (!user.passkeys.some(passkey => passkey.id === credential.id)) {
    user.passkeys.push({
      id: credential.id,
      publicKey: toBase64url(credential.publicKey),
      counter: credential.counter,
      transports: response.response?.transports || [],
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
      createdAt: new Date().toISOString()
    });
  }
  user.updatedAt = new Date().toISOString();
  await writeDB(db);
  setSession(res, req, user.id);
  clearTransaction(res, req);
  return sendJSON(res, 200, { user: publicUser(user) });
};
