#!/usr/bin/env node
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SPA_PATHS = new Set(["/", "/authorize", "/grants", "/keys", "/login", "/deploy", "/integrate"]);
const API_ROUTES = new Map([
  ["/api/me", "api/me.js"],
  ["/api/keys", "api/keys.js"],
  ["/api/token", "api/token.js"],
  ["/api/create-grant", "api/create-grant.js"],
  ["/api/passkey/register-options", "api/passkey/register-options.js"],
  ["/api/passkey/register-verify", "api/passkey/register-verify.js"],
  ["/api/passkey/login-options", "api/passkey/login-options.js"],
  ["/api/passkey/login-verify", "api/passkey/login-verify.js"],
  ["/api/auth/logout", "api/auth/logout.js"],
  ["/api/auth/github/start", "api/auth/github/start.js"],
  ["/api/auth/github/callback", "api/auth/github/callback.js"]
]);

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, ".env.local"));

const args = parseArgs(process.argv.slice(2));
const host = args.host || process.env.HOST || "127.0.0.1";
const port = Number(args.port || process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  res.json = (body) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };

  try {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
    const routeFile = API_ROUTES.get(url.pathname);
    if (routeFile) {
      const handler = require(path.join(ROOT, routeFile));
      await handler(req, res);
      return;
    }

    if (SPA_PATHS.has(url.pathname)) {
      await serveFile(res, path.join(PUBLIC_DIR, "index.html"));
      return;
    }

    const requestedPath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(PUBLIC_DIR, requestedPath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      sendText(res, 403, "Forbidden");
      return;
    }
    await serveFile(res, filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(res, 404, "Not Found");
      return;
    }
    console.error(error);
    sendText(res, 500, "Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`BYOK listening on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
});

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--host") result.host = values[++index];
    if (value === "--port") result.port = values[++index];
  }
  return result;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

async function serveFile(res, filePath) {
  const stat = await fsp.stat(filePath);
  if (stat.isDirectory()) throw Object.assign(new Error("not_found"), { code: "ENOENT" });
  res.statusCode = 200;
  res.setHeader("content-type", contentType(filePath));
  res.end(await fsp.readFile(filePath));
}

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(text);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  if (ext === ".sh") return "text/x-shellscript; charset=utf-8";
  if (ext === ".tgz" || ext === ".gz") return "application/gzip";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

function applySecurityHeaders(res) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}
