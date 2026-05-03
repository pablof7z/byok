function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      const type = String(req.headers["content-type"] || "");
      try {
        if (type.includes("application/json")) {
          resolve(body ? JSON.parse(body) : {});
          return;
        }
        const params = new URLSearchParams(body);
        resolve(Object.fromEntries(params.entries()));
      } catch {
        reject(new Error("invalid_body"));
      }
    });
  });
}

function sendJSON(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function cookie(name, value, req, options = {}) {
  const secure = isSecure(req);
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAge ?? 60 * 60 * 24 * 30}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name, req) {
  return cookie(name, "", req, { maxAge: 0 });
}

function appendSetCookie(res, value) {
  const current = res.getHeader("set-cookie");
  if (!current) {
    res.setHeader("set-cookie", value);
  } else if (Array.isArray(current)) {
    res.setHeader("set-cookie", [...current, value]);
  } else {
    res.setHeader("set-cookie", [current, value]);
  }
}

function isSecure(req) {
  return String(req.headers["x-forwarded-proto"] || "").includes("https") || req.headers.host === "byok.f7z.io";
}

function publicOrigin(req) {
  if (process.env.BYOK_PUBLIC_ORIGIN) return process.env.BYOK_PUBLIC_ORIGIN.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const proto = isSecure(req) ? "https" : "http";
  return `${proto}://${host}`;
}

function safeReturnTo(value) {
  const raw = String(value || "/");
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function redirect(res, location, status = 302) {
  res.statusCode = status;
  res.setHeader("location", location);
  res.end();
}

module.exports = {
  appendSetCookie,
  clearCookie,
  cookie,
  parseCookies,
  publicOrigin,
  readBody,
  redirect,
  safeReturnTo,
  sendJSON
};
