#!/usr/bin/env node
/* Ely Cowork · lanzador en Node.js
 *
 *   node CLI/bin/ely.js serve [--port 8765]   IDE + proxy /api -> backend Python
 *   node CLI/bin/ely.js probe [perfil]        prueba URL + API Key desde Node
 *   node CLI/bin/ely.js test-all              las 11 claves en paralelo
 *   node CLI/bin/ely.js profiles              tabla de perfiles
 *
 * El frontend es estático (IDE/frontend) y la lógica de proveedores vive en
 * Python (CLI/ely_cli). Este lanzador hace de servidor estático y reverse
 * proxy, y además puede hablar con los proveedores por su cuenta (`probe`).
 */
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND = path.join(ROOT, "IDE", "frontend");
const PROFILES_DIR = path.join(ROOT, "profiles");
const BACKEND_PORT = Number(process.env.ELY_BACKEND_PORT || 8766);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

/* ------------------------------------------------------------------ config */
function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#") || !clean.includes("=")) continue;
    const index = clean.indexOf("=");
    out[clean.slice(0, index).trim()] = clean.slice(index + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function keys() {
  const merged = {
    ...parseEnvFile(path.join(PROFILES_DIR, "test-keys.env")),
    ...parseEnvFile(path.join(ROOT, ".ely", "keys.env"))
  };
  for (const [name, value] of Object.entries(process.env)) {
    if (/(_API_KEY|_KEY|_TOKEN)$/.test(name) || name.startsWith("ELY_")) merged[name] = value;
  }
  return merged;
}

function fill(value, env) {
  return String(value || "").replace(/\{([A-Z0-9_]+)\}/g, (_, name) => env[name] || "");
}

function profiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  const env = { ...process.env, ...keys() };
  return fs.readdirSync(PROFILES_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const raw = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, file), "utf8"));
      const list = Array.isArray(raw) ? raw : [raw];
      return list.map((item) => {
        const keyVar = item.key_var || `${String(item.id).toUpperCase().replace(/-/g, "_")}_API_KEY`;
        const apiKey = env[keyVar] || item.api_key || "";
        return {
          id: item.id,
          label: item.label || item.id,
          provider: item.provider || "openai",
          model: fill(item.model, env),
          baseUrl: fill(item.base_url, env),
          keyVar,
          apiKey,
          timeout: item.timeout || 60,
          chatPath: item.chat_path || (item.provider === "anthropic" ? "/messages" : "/chat/completions")
        };
      });
    })
    .flat()
    .sort((a, b) => a.id.localeCompare(b.id));
}

function endpoint(profile) {
  const base = profile.baseUrl.replace(/\/$/, "");
  if (!base) return "";
  if (/\/(chat\/completions|messages|responses)$/.test(base)) return base;
  return base + profile.chatPath;
}

function mask(key) {
  if (!key) return "";
  return key.length > 12 ? key.slice(0, 6) + "…" + key.slice(-4) : "•".repeat(key.length);
}

/* ------------------------------------------------------------------ probe */
function probe(profile, mode = "chat") {
  return new Promise((resolve) => {
    const url = mode === "models" ? profile.baseUrl.replace(/\/$/, "") + "/models" : endpoint(profile);
    const started = Date.now();
    const headers = { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "ElyCowork-Node/0.9.0" };
    if (profile.apiKey) {
      if (profile.provider === "anthropic") {
        headers["x-api-key"] = profile.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers.Authorization = "Bearer " + profile.apiKey;
      }
    }
    if (!url) {
      return resolve({ profile: profile.id, ok: false, reachable: false, url, detail: "base_url vacía (define la variable de entorno)" });
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return resolve({ profile: profile.id, ok: false, reachable: false, url, detail: "URL inválida: " + err.message });
    }
    const body = mode === "models" ? null : JSON.stringify({
      model: profile.model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0,
      stream: false
    });
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: mode === "models" ? "GET" : "POST",
      headers: body ? { ...headers, "Content-Length": Buffer.byteLength(body) } : headers,
      timeout: profile.timeout * 1000
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const latency = Date.now() - started;
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        let detail = ok ? "Respuesta válida del proveedor" : `HTTP ${res.statusCode}`;
        if (!ok) {
          try {
            const parsedBody = JSON.parse(data);
            detail = (parsedBody.error && (parsedBody.error.message || parsedBody.error)) || detail;
            if (typeof detail === "object") detail = JSON.stringify(detail);
          } catch (e) { /* cuerpo no JSON */ }
        }
        resolve({
          profile: profile.id, ok, status: res.statusCode, latency_ms: latency, url,
          credential: mask(profile.apiKey), reachable: true,
          credential_valid: res.statusCode !== 401 && res.statusCode !== 403,
          detail: String(detail).slice(0, 300)
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => {
      resolve({
        profile: profile.id, ok: false, reachable: false, url, latency_ms: Date.now() - started,
        detail: `${err.code || err.name}: ${err.message}`,
        hint: "Sin respuesta HTTP: DNS, TLS o un proxy de salida bloquea el host."
      });
    });
    if (body) req.write(body);
    req.end();
  });
}

/* ------------------------------------------------------------------ proxy */
function proxy(req, res, body) {
  const upstream = http.request({
    host: "127.0.0.1",
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${BACKEND_PORT}` }
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, {
      ...upstreamRes.headers,
      "Access-Control-Allow-Origin": req.headers.origin || "*"
    });
    upstreamRes.pipe(res);
  });
  upstream.on("error", (err) => {
    const payload = JSON.stringify({
      error: "El backend Python no está disponible en 127.0.0.1:" + BACKEND_PORT,
      detail: err.code + ": " + err.message,
      hint: "Arranca: cd CLI && python3 -m ely_cli serve --port " + BACKEND_PORT
    });
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
    res.end(payload);
  });
  if (body && body.length) upstream.write(body);
  upstream.end();
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const target = path.resolve(FRONTEND, "." + rel);
  if (!target.startsWith(FRONTEND)) {
    res.writeHead(403).end("fuera del frontend");
    return;
  }
  const file = fs.existsSync(target) && fs.statSync(target).isFile()
    ? target
    : path.join(FRONTEND, "index.html");
  if (!fs.existsSync(file)) {
    res.writeHead(404).end("frontend no encontrado: " + FRONTEND);
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const data = fs.readFileSync(file);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": data.length,
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function backendAlive() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: BACKEND_PORT });
    socket.setTimeout(600);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => resolve(false));
  });
}

async function serve(port) {
  const alive = await backendAlive();
  let child = null;
  if (!alive) {
    console.log(`· arrancando backend Python en 127.0.0.1:${BACKEND_PORT}…`);
    child = spawn(process.env.PYTHON || "python3", ["-m", "ely_cli", "serve", "--port", String(BACKEND_PORT), "--host", "127.0.0.1"], {
      cwd: path.join(ROOT, "CLI"),
      stdio: ["ignore", "inherit", "inherit"]
    });
    child.on("exit", (code) => {
      if (code !== 0 && code !== null) console.log("· backend Python terminó con código " + code);
    });
    for (let i = 0; i < 40 && !(await backendAlive()); i += 1) {
      await new Promise((r) => setTimeout(r, 150));
    }
  } else {
    console.log(`· backend Python ya estaba activo en 127.0.0.1:${BACKEND_PORT}`);
  }

  const server = http.createServer((req, res) => {
    let body = [];
    req.on("data", (chunk) => body.push(chunk));
    req.on("end", () => {
      const buffer = Buffer.concat(body);
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": req.headers.origin || "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
        });
        return res.end();
      }
      if (req.url.startsWith("/api/")) return proxy(req, res, buffer);
      return serveStatic(req, res);
    });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`◆ Ely Cowork · Node ${process.version}`);
    console.log(`  IDE   : http://localhost:${port}`);
    console.log(`  API   : http://localhost:${port}/api/health  →  Python :${BACKEND_PORT}`);
    console.log(`  static: ${FRONTEND}`);
  });

  const shutdown = () => {
    server.close();
    if (child) child.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/* ------------------------------------------------------------------ comandos */
function table(rows) {
  const head = ["ID", "MODELO", "CLAVE", "ENDPOINT"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cols) => cols.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log("\n  " + line(head));
  console.log("  " + widths.map((w) => "─".repeat(w)).join("  "));
  rows.forEach((r) => console.log("  " + line(r)));
  console.log("");
}

async function main() {
  const [command = "serve", ...rest] = process.argv.slice(2);
  const arg = (name, def) => {
    const index = rest.indexOf(name);
    return index >= 0 && rest[index + 1] ? rest[index + 1] : def;
  };

  if (command === "routes") {
    const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/routes`).catch(() => null);
    if (!res) {
      console.error("El backend Python no está activo en 127.0.0.1:" + BACKEND_PORT);
      process.exit(1);
    }
    const data = await res.json();
    for (const group of data.nav) {
      console.log("\n  " + group.group);
      for (const item of group.items) console.log(`   ${item.icon} ${item.label.padEnd(18)} #${item.id}`);
    }
    console.log("");
    return;
  }

  if (command === "profiles") {
    table(profiles().map((p) => [p.id, p.model || "—", mask(p.apiKey) || "sin clave", endpoint(p) || "—"]));
    return;
  }

  if (command === "probe" || command === "test") {
    const wanted = rest.find((value) => !value.startsWith("-"));
    const list = profiles().filter((p) => !wanted || p.id === wanted);
    if (!list.length) {
      console.error("Perfil no encontrado: " + wanted);
      process.exit(1);
    }
    console.log(`\n  Prueba real desde Node · ${list.length} perfil(es)\n`);
    let failures = 0;
    for (const profile of list) {
      const result = await probe(profile, arg("--mode", "chat"));
      const state = result.ok ? "✓ en línea"
        : result.reachable ? (result.status === 401 || result.status === 403 ? "✓ auth rechazada" : "✗ HTTP " + result.status)
        : "✗ sin respuesta";
      if (!result.ok) failures += 1;
      console.log(`  ${profile.id.padEnd(12)} ${state.padEnd(20)} ${String(result.status || "—").padEnd(5)} ${String(result.latency_ms || "—") + "ms"}`);
      console.log("  " + " ".repeat(12) + " " + endpoint(profile));
      if (!result.ok) console.log("  " + " ".repeat(12) + " " + result.detail);
      console.log("");
    }
    console.log(`  ${list.length - failures} válidas · ${failures} sin conexión completa\n`);
    process.exit(failures === list.length ? 2 : 0);
  }

  if (command === "test-all") {
    const results = await Promise.all(profiles().map((p) => probe(p)));
    table(results.map((r) => [
      r.profile,
      r.ok ? "en línea" : (r.reachable ? "auth rechazada" : "sin respuesta"),
      String(r.status || "—"),
      r.detail.slice(0, 60)
    ]));
    process.exit(0);
  }

  if (command === "serve") {
    await serve(Number(arg("--port", process.env.PORT || 8765)));
    return;
  }

  console.log(`
  Ely Cowork · Node launcher

    node CLI/bin/ely.js serve [--port 8765]   IDE + proxy al backend Python
    node CLI/bin/ely.js probe [perfil]        prueba real de URL + API Key
    node CLI/bin/ely.js test-all              las 11 claves en paralelo
    node CLI/bin/ely.js routes                vistas que publica el backend
    node CLI/bin/ely.js profiles              tabla de perfiles

  Raíz del repositorio: ${ROOT}
`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
