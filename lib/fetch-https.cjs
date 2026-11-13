const https = require("https");
const { URL } = require("url");

function request(url, options = {}) {
  const { method = "GET", headers = {}, body = null, signal = null } = options;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, headers: res.headers, text: () => Promise.resolve(text) });
        });
      }
    );

    req.on("error", (e) => reject(e));
    req.setTimeout(30000, () => {
      req.destroy(new Error("timeout"));
    });

    if (signal) {
      if (signal.aborted) {
        req.destroy(new Error("aborted"));
      } else {
        signal.addEventListener("abort", () => req.destroy(new Error("aborted")));
      }
    }

    if (body) req.write(body);
    req.end();
  });
}

module.exports = { request };
