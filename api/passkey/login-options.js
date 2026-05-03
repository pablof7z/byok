const { generateAuthenticationOptions } = require("@simplewebauthn/server");
const { setTransaction } = require("../_auth");
const { sendJSON } = require("../_http");
const { rpID } = require("../_webauthn");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "POST");
    return res.end("Method Not Allowed");
  }

  const options = await generateAuthenticationOptions({
    rpID: rpID(req),
    userVerification: "required"
  });
  setTransaction(res, req, { kind: "passkey-login", challenge: options.challenge });
  return sendJSON(res, 200, options);
};
