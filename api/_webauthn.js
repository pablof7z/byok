const { publicOrigin } = require("./_http");

function rpID(req) {
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(":")[0];
  return host === "127.0.0.1" ? "localhost" : host;
}

function expectedOrigin(req) {
  return publicOrigin(req);
}

function toBase64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64url(input) {
  const value = String(input || "");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function storedCredential(passkey) {
  return {
    id: passkey.id,
    publicKey: fromBase64url(passkey.publicKey),
    counter: passkey.counter || 0,
    transports: passkey.transports || []
  };
}

module.exports = {
  expectedOrigin,
  fromBase64url,
  rpID,
  storedCredential,
  toBase64url
};
