"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

/**
 * Loopback HTTP Agent over ConsoleControl.
 *
 * @param {object} opts
 * @param {import('./console-control').ConsoleControl} opts.control
 * @param {string} opts.accessToken
 * @param {string} opts.staticRoot
 * @param {string} [opts.host]
 * @param {number} [opts.port]
 * @returns {Promise<{ server: import('node:http').Server, host: string, port: number, close: () => Promise<void> }>}
 */
function startAgentServer(opts) {
  const host = opts.host || "127.0.0.1";
  const port = opts.port === undefined || opts.port === null ? 8787 : Number(opts.port);
  const accessToken = String(opts.accessToken || "");
  const staticRoot = opts.staticRoot;
  const control = opts.control;

  /** @type {Set<import('node:http').ServerResponse>} */
  const sseClients = new Set();

  const previousOnEvent = control.onEvent;
  control.onEvent = (event) => {
    try {
      previousOnEvent(event);
    } catch {
      // ignore
    }
    broadcastSse(sseClients, event);
  };

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, {
        control,
        accessToken,
        staticRoot,
        sseClients,
      });
    } catch (err) {
      if (!res.headersSent) {
        json(res, 500, { ok: false, reason: String(err.message || err) });
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const boundPort =
        addr && typeof addr === "object" ? addr.port : port;
      console.error(
        `[agent] listening on http://${host}:${boundPort} (loopback only)`
      );
      resolve({
        server,
        host,
        port: boundPort,
        close: () =>
          new Promise((resClose, rejClose) => {
            for (const client of sseClients) {
              try {
                client.end();
              } catch {
                // ignore
              }
            }
            sseClients.clear();
            server.close((err) => (err ? rejClose(err) : resClose()));
          }),
      });
    });
  });
}

function broadcastSse(clients, event) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {object} ctx
 */
async function handleRequest(req, res, ctx) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname;

  if (pathname === "/api/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/")) {
    if (!authorize(req, ctx.accessToken)) {
      console.error(`[agent] auth failed ${req.method} ${pathname}`);
      json(res, 401, { ok: false, reason: "Unauthorized" });
      return;
    }
    await handleApi(req, res, url, ctx);
    return;
  }

  await serveStatic(req, res, pathname, ctx.staticRoot);
}

function authorize(req, accessToken) {
  if (!accessToken) return false;
  const header = String(req.headers.authorization || "");
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return timingSafeEqualString(m[1].trim(), accessToken);
}

function timingSafeEqualString(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return require("node:crypto").timingSafeEqual(ba, bb);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {object} ctx
 */
async function handleApi(req, res, url, ctx) {
  const { control, sseClients } = ctx;
  const pathname = url.pathname;
  const method = (req.method || "GET").toUpperCase();

  if (method === "GET" && pathname === "/api/readiness") {
    let targets;
    const raw = url.searchParams.get("targets");
    if (raw) {
      try {
        targets = JSON.parse(raw);
      } catch {
        json(res, 400, { ok: false, reason: "Invalid targets query JSON" });
        return;
      }
    }
    json(res, 200, control.getReadiness(targets ? { targets } : {}));
    return;
  }

  if (method === "PUT" && pathname === "/api/app-root") {
    const body = await readJson(req);
    const result = control.setAppRoot(body.appRoot);
    json(res, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "PUT" && pathname === "/api/pgyer-api-key") {
    const body = await readJson(req);
    const result = control.setPgyerApiKey(body.apiKey ?? body.pgyerApiKey);
    json(res, 200, result);
    return;
  }

  if (method === "POST" && pathname === "/api/branch/checkout") {
    const body = await readJson(req);
    const result = control.checkoutBranch(body.branch || body.branchName);
    json(res, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "POST" && pathname === "/api/runs") {
    const body = await readJson(req);
    const result = control.startRun(body);
    if (!result.ok && result.code === "build_busy") {
      json(res, 409, result);
      return;
    }
    json(res, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "POST" && /^\/api\/runs\/[^/]+\/cancel$/.test(pathname)) {
    const id = pathname.split("/")[3];
    const result = control.cancelRun(id);
    json(res, result.ok ? 200 : 404, result);
    return;
  }

  if (method === "GET" && pathname === "/api/runs/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(": ok\n\n");
    sseClients.add(res);
    req.on("close", () => {
      sseClients.delete(res);
    });
    return;
  }

  if (method === "GET" && pathname === "/api/upload-presentation") {
    const result = control.getUploadPresentation();
    json(res, result.ok ? 200 : 404, result);
    return;
  }

  json(res, 404, { ok: false, reason: "Not found" });
}

async function serveStatic(req, res, pathname, staticRoot) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    res.writeHead(405);
    res.end();
    return;
  }

  let rel = pathname === "/" ? "/index.html" : pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const root = path.resolve(staticRoot);
  const filePath = path.resolve(root, `.${rel.startsWith("/") ? rel : `/${rel}`}`);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (filePath !== root && !filePath.startsWith(rootWithSep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

module.exports = { startAgentServer };
