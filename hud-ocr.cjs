const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const LIMIT = 2_000_000;

function makeReader() {
  let worker, ready, waiting;
  return async function read(image) {
    if (waiting) throw Error('Local HUD scanner is busy.');
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer);
        waiting = null;
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => {
        const timedOut = worker;
        worker = null;
        ready = false;
        timedOut?.kill();
        finish(Error('Local HUD recognition timed out.'));
      }, 12000);
      const submit = () => worker.stdin.write(image.toString('base64') + '\n');
      waiting = { finish, submit };
      if (worker && ready) return submit();
      ready = false;
      let script;
      try { script = readFileSync(path.join(__dirname, 'hud-ocr.ps1'), 'utf8'); }
      catch (error) { finish(error); return; }
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
      });
      worker = child;
      const failed = () => {
        if (worker !== child) return;
        worker = null;
        ready = false;
        waiting?.finish(Error('Local HUD scanning requires the English Windows OCR language pack.'));
      };
      child.on('error', failed);
      child.on('exit', failed);
      child.stdin.on('error', failed);
      createInterface({ input: child.stdout }).on('line', line => {
        if (worker !== child || !waiting) return;
        if (!ready && line === 'ready') {
          ready = true;
          waiting.submit();
          return;
        }
        try {
          const result = JSON.parse(line);
          waiting.finish(result.error ? Error(result.error) : null, result.words);
        } catch {
          waiting?.finish(Error('Invalid response from the local HUD scanner.'));
        }
      });
    });
  };
}

function makeHudEndpoint(origin, read = makeReader()) {
  return async function hudEndpoint(request, response) {
    const reply = (code, body) => {
      if (!response.destroyed) response.writeHead(code, {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store'
      }).end(JSON.stringify(body));
    };
    if (request.method === 'GET') return reply(200, { available: process.platform === 'win32' });
    if (request.method !== 'POST') return reply(405, { error: 'Use POST for HUD samples.' });
    if (request.headers.origin !== origin || request.headers['content-type'] !== 'image/png')
      return reply(403, { error: 'HUD samples must come from the local CLUTCHUP dashboard.' });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > LIMIT) {
          request.resume();
          return reply(413, { error: 'HUD sample exceeds the local limit.' });
        }
        chunks.push(chunk);
      }
      const png = Buffer.concat(chunks);
      if (png.length < 33 || !png.subarray(0, 8).equals(PNG) ||
          png.toString('ascii', 12, 16) !== 'IHDR' || png.readUInt32BE(16) > 1200 || png.readUInt32BE(20) > 700)
        return reply(400, { error: 'Invalid HUD sample.' });
      return reply(200, { words: await read(png) });
    } catch (error) {
      return reply(503, { error: error.message || 'Local HUD recognition failed.' });
    }
  };
}

module.exports = { makeHudEndpoint, makeReader };
