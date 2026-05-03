const { appendSetCookie, clearCookie, cookie, parseCookies } = require("./_http");
const { openJSON, sealJSON } = require("./_crypto");
const { findUser, readDB } = require("./_db");

const SESSION_COOKIE = "byok_session";
const TX_COOKIE = "byok_tx";

function setSession(res, req, userID) {
  const now = Math.floor(Date.now() / 1000);
  appendSetCookie(res, cookie(SESSION_COOKIE, sealJSON({ userID, iat: now, exp: now + 60 * 60 * 24 * 30 }, "session"), req));
}

function clearSession(res, req) {
  appendSetCookie(res, clearCookie(SESSION_COOKIE, req));
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "unauthorized" }));
    return null;
  }
  return user;
}

async function currentUser(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  try {
    const session = openJSON(raw, "session");
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    const db = await readDB();
    return findUser(db, session.userID) || null;
  } catch {
    return null;
  }
}

function setTransaction(res, req, payload, maxAge = 600) {
  const now = Math.floor(Date.now() / 1000);
  appendSetCookie(res, cookie(TX_COOKIE, sealJSON({ ...payload, iat: now, exp: now + maxAge }, "session"), req, { maxAge }));
}

function readTransaction(req) {
  const raw = parseCookies(req)[TX_COOKIE];
  if (!raw) return null;
  try {
    const tx = openJSON(raw, "session");
    if (!tx.exp || tx.exp < Math.floor(Date.now() / 1000)) return null;
    return tx;
  } catch {
    return null;
  }
}

function clearTransaction(res, req) {
  appendSetCookie(res, clearCookie(TX_COOKIE, req));
}

module.exports = {
  clearSession,
  clearTransaction,
  currentUser,
  readTransaction,
  requireUser,
  setSession,
  setTransaction
};
