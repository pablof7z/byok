const { generateRegistrationOptions } = require("@simplewebauthn/server");
const { currentUser, setTransaction } = require("../_auth");
const { createUser, findUserByEmail, readDB } = require("../_db");
const { readBody, sendJSON } = require("../_http");
const { rpID } = require("../_webauthn");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "POST");
    return res.end("Method Not Allowed");
  }

  const db = await readDB();
  const body = await readBody(req);
  const sessionUser = await currentUser(req);
  let user = sessionUser ? db.users.find(item => item.id === sessionUser.id) : null;

  if (!user) {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return sendJSON(res, 400, { error: "email_required" });
    if (findUserByEmail(db, email)) return sendJSON(res, 409, { error: "email_already_exists" });
    user = createUser({ email, name: body.name || email });
  }

  const options = await generateRegistrationOptions({
    rpName: "BYOK",
    rpID: rpID(req),
    userID: Buffer.from(user.id),
    userName: user.email || user.id,
    userDisplayName: user.name || user.email || "BYOK User",
    attestationType: "none",
    excludeCredentials: (user.passkeys || []).map(passkey => ({ id: passkey.id, transports: passkey.transports || [] })),
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required"
    }
  });

  setTransaction(res, req, {
    kind: "passkey-register",
    challenge: options.challenge,
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar || "" },
    newUser: !sessionUser
  });
  return sendJSON(res, 200, options);
};
