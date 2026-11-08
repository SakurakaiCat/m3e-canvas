import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { get as httpGet } from "node:http";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* The real server.mjs is started against a throwaway out/ tree, and exercised over http. */

let child;
let base;
let root;

const get = async (path, auth) => {
  const headers = auth ? { authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {};
  const res = await fetch(base + path, { headers, redirect: "manual" });
  return { status: res.status, body: await res.text(), wwwAuth: res.headers.get("www-authenticate") };
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "m3e-out-"));
  await mkdir(join(root, "_next", "static"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "index.html"), "<h1>home</h1>");
  await writeFile(join(root, "secret.txt"), "top secret");
  await writeFile(join(root, "docs", "index.html"), "<h1>docs</h1>");
  await writeFile(join(root, "_next", "static", "a.js"), "console.log(1)");

  child = spawn(process.execPath, [join(import.meta.dirname, "server.mjs")], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", OUT_DIR: root, AUTH_USER: "alice", AUTH_PASS: "s3cret" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  base = await new Promise((ok, err) => {
    const fail = (m) => err(new Error(m));
    child.stdout.on("data", (d) => {
      const port = /http:\/\/[\d.]+:(\d+)/.exec(d.toString())?.[1];
      if (port) ok(`http://127.0.0.1:${port}`);
    });
    child.on("exit", (code) => fail(`server exited early with ${code}`));
    setTimeout(() => fail("server did not report its port"), 5000);
  });
});

afterAll(() => {
  child?.kill();
});

describe("the auth-gated static server", () => {
  it("refuses to start without credentials", async () => {
    const bad = spawn(process.execPath, [join(import.meta.dirname, "server.mjs")], { env: { ...process.env, PORT: "0" } });
    const code = await new Promise((ok) => bad.on("exit", ok));
    expect(code).not.toBe(0);
  });

  it("asks for credentials with a 401 and a Basic challenge", async () => {
    const r = await get("/");
    expect(r.status).toBe(401);
    expect(r.wwwAuth).toContain('Basic realm="M3E Canvas"');
  });

  it("rejects wrong credentials", async () => {
    expect((await get("/", "alice:wrong")).status).toBe(401);
    expect((await get("/", "bob:s3cret")).status).toBe(401);
  });

  it("serves index.html for / and for a trailing-slash directory", async () => {
    expect(await get("/", "alice:s3cret")).toMatchObject({ status: 200, body: "<h1>home</h1>" });
    expect(await get("/docs/", "alice:s3cret")).toMatchObject({ status: 200, body: "<h1>docs</h1>" });
  });

  it("serves a plain file and a hashed static asset", async () => {
    expect(await get("/secret.txt", "alice:s3cret")).toMatchObject({ status: 200, body: "top secret" });
    expect((await get("/_next/static/a.js", "alice:s3cret")).status).toBe(200);
  });

  it("resolves an extension-less page to its directory index", async () => {
    expect(await get("/docs", "alice:s3cret")).toMatchObject({ status: 200, body: "<h1>docs</h1>" });
  });

  it("keeps path traversal clamped inside the document root", async () => {
    expect((await get("/../package.json", "alice:s3cret")).status).toBe(404);
    expect((await get("/..%2f..%2f..%2fetc%2fpasswd", "alice:s3cret")).status).toBe(404);
    /* fetch normalizes ".." before the request leaves, so a raw request is
       needed to exercise the server's own clamping: /docs/../../secret.txt
       must land on the root's own secret.txt (200 here), never on a file
       above OUT_DIR — the temp parent has no secret.txt, so 200 proves the
       ".." segments were clamped into the root rather than followed. */
    const { status, body } = await new Promise((ok, err) => {
      const { hostname, port } = new URL(base);
      httpGet({ hostname, port: Number(port), path: "/docs/../../secret.txt", headers: { authorization: `Basic ${Buffer.from("alice:s3cret").toString("base64")}` } }, (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => ok({ status: res.statusCode, body: out }));
      }).on("error", err);
    });
    expect(status).toBe(200);
    expect(body).toBe("top secret");
  });

  it("answers 404 for anything that does not exist", async () => {
    expect((await get("/nope/", "alice:s3cret")).status).toBe(404);
  });
});
