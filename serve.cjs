const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const { createReadStream } = require("node:fs");
const { stat } = require("node:fs/promises");
const path = require("node:path");
const { makeClipEndpoint } = require('./clip-analysis.cjs');

const root = path.join(__dirname, "dist");
const host = "127.0.0.1";
const port = 4174;
const origin = 'http://' + host + ':' + port;
const clipEndpoint = makeClipEndpoint({ origin });
const playUrl = "http://" + host + ":" + port + "/#home";
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

createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (pathname === '/api/clip-analysis') return clipEndpoint(request, response);
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
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
}).listen(port, host, () => {
  console.log("ClutchIQ is running at " + playUrl);
  if (process.argv.includes("--open")) {
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", playUrl], { stdio: "ignore", windowsHide: true })
      .on("error", () => console.log("Open the address above in your browser."))
      .unref();
  }
});
