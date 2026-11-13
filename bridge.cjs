const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.BRIDGE_PORT || 8099);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const ALLOW = [
  /(^|\.)hh\.ru$/,
  /(^|\.)trudvsem\.ru$/,
  /(^|\.)avito\.ru$/,
  /(^|\.)habr\.com$/,
  /(^|\.)getmatch\.ru$/,
  /(^|\.)geekjob\.ru$/,
  /(^|\.)remoteok\.com$/,
  /(^|\.)remotive\.com$/,
];

async function handler(req, res) {
  const u = new URL(req.url, "http://localhost");

  if (u.pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (u.pathname !== "/fetch") {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  const target = u.searchParams.get("url");
  if (!target) {
    res.writeHead(400);
    res.end("url required");
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    res.writeHead(400);
    res.end("bad url");
    return;
  }

  if (parsed.protocol !== "https:" || !ALLOW.some((rx) => rx.test(parsed.hostname))) {
    res.writeHead(403);
    res.end("host not allowed");
    return;
  }

  try {
    const r = await fetch(target, {
      headers: { "User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9" },
    });
    const body = await r.text();
    res.writeHead(r.status, {
      "Content-Type": r.headers.get("content-type") || "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
  } catch (e) {
    res.writeHead(502);
    res.end("upstream error: " + e.message);
  }
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((e) => {
    res.writeHead(500);
    res.end("bridge error: " + e.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Мост запущен на порту " + PORT);
  for (const addr of Object.values(require("os").networkInterfaces()).flat()) {
    if (addr && addr.family === "IPv4" && !addr.internal) {
      console.log("  адрес для телефона: http://" + addr.address + ":" + PORT + "/ping");
    }
  }
});
