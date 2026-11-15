const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const { createReadStream } = require("node:fs");
const { stat } = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require('node:crypto');
const { makeHudEndpoint } = require('./hud-ocr.cjs');
const { makeClipEndpoint } = require('./clip-analysis.cjs');

const root = path.join(__dirname, "dist");
const host = "127.0.0.1";
const port = Number(process.env.CLUTCHUP_PORT || 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('CLUTCHUP_PORT must be a valid TCP port.');
const origin = 'http://' + host + ':' + port;
const clipEndpoint = makeClipEndpoint({ origin });
const hudEndpoint = makeHudEndpoint(origin);
const playUrl = "http://" + host + ":" + port + "/#home";
const build = { name: 'CLUTCHUP', revision: 'temporal-valorant-hud-v1',
  checkout: createHash('sha256').update(path.resolve(root)).digest('hex') };
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8"
};

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (pathname === '/api/local-hud') return hudEndpoint(request, response);
  if (pathname === '/api/clip-analysis') return clipEndpoint(request, response);
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  if (pathname === '/api/build') {
    response.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(build));
    return;
  }
  const file = path.resolve(root, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(404).end();
    return;
  }
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": types[path.extname(file)] || "application/octet-stream",
    "Content-Length": info.size,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache"
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(file).on("error", () => response.destroy()).pipe(response);
});

function openBrowser() {
  spawn("rundll32.exe", ["url.dll,FileProtocolHandler", playUrl], { stdio: "ignore", windowsHide: true })
    .on("error", () => console.log("Open " + playUrl + " in your browser."))
    .unref();
}
server.on('error', async error => {
  if (error.code === 'EADDRINUSE' && process.argv.includes('--open')) {
    try {
      const response = await fetch(origin + '/api/build', {signal:AbortSignal.timeout(2000)});
      const running = response.ok && await response.json();
      if (running?.checkout === build.checkout && running.revision === build.revision) {
        openBrowser();
        return;
      }
    } catch { /* The occupied port does not expose this build's identity. */ }
  }
  console.error(error.code === 'EADDRINUSE'
    ? 'Port '+port+' is in use by another server. Stop the older CLUTCHUP window with Ctrl+C, then rerun this launcher.'
    : 'Could not start CLUTCHUP: '+error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log("CLUTCHUP is running at " + playUrl);
  if (process.argv.includes("--open")) openBrowser();
});
