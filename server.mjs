/* A zero-dependency static server for the exported site in ./out with HTTP Basic auth.
 * Credentials come from the environment: AUTH_USER and AUTH_PASS are both required,
 * the server refuses to start without them. Run with `node server.mjs`. */
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), process.env.OUT_DIR || "out");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const REALM = "M3E Canvas";

const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASS = process.env.AUTH_PASS;
if (!AUTH_USER || !AUTH_PASS) {
  console.error("server.mjs: set AUTH_USER and AUTH_PASS in the environment (e.g. an EnvironmentFile)");
  process.exit(1);
}

/* sha256 both sides so timingSafeEqual always gets equal-length buffers */
const sha = (v) => createHash("sha256").update(v).digest();
const USER_HASH = sha(AUTH_USER);
const PASS_HASH = sha(AUTH_PASS);

const check = (user, pass) =>
  user !== undefined && pass !== undefined &&
  timingSafeEqual(USER_HASH, sha(user)) && timingSafeEqual(PASS_HASH, sha(pass));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const unauthorized = (res) => {
  res.writeHead(401, { "www-authenticate": `Basic realm="${REALM}", charset="UTF-8"` });
  res.end("Unauthorized");
};

/* every request must carry the right Authorization: Basic header */
const authorized = (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  return check(decoded.slice(0, i), decoded.slice(i + 1));
};

/* the export uses trailingSlash: every page is a directory with an index.html */
const candidatesFor = (urlPath) => {
  const clean = normalize(decodeURIComponent(urlPath)).replaceAll("\\", "/");
  if (clean.includes("\0") || clean.split("/").includes("..")) return [];
  const rel = clean.replace(/^\/+/, "");
  const dir = rel === "" || rel.endsWith("/");
  const base = join(ROOT, dir ? rel : rel + "/");
  return dir ? [join(base, "index.html")] : [join(base, "index.html"), join(base.slice(0, -1))];
};

const server = createServer(async (req, res) => {
  try {
    if (!authorized(req)) return unauthorized(res);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" });
      return res.end("Method Not Allowed");
    }
    for (const file of candidatesFor(req.url?.split("?")[0] || "/")) {
      if (!resolve(file).startsWith(ROOT + sep) && resolve(file) !== ROOT) continue;
      let s;
      try {
        s = await stat(file);
      } catch {
        continue;
      }
      if (!s.isFile()) continue;
      const ext = extname(file).toLowerCase();
      const cache = file.includes(`${sep}_next${sep}static${sep}`) ? "public, max-age=31536000, immutable" : "no-cache";
      res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream", "content-length": s.size, "cache-control": cache });
      if (req.method === "HEAD") return res.end();
      return res.end(await readFile(file));
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  } catch (e) {
    console.error("server.mjs:", e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  console.log(`m3e-canvas serving ${ROOT} on http://${addr.address}:${addr.port} (basic auth: ${AUTH_USER})`);
});
