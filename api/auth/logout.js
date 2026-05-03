const { clearSession, clearTransaction } = require("../_auth");
const { sendJSON } = require("../_http");

module.exports = async function handler(req, res) {
  clearSession(res, req);
  clearTransaction(res, req);
  return sendJSON(res, 200, { ok: true });
};
