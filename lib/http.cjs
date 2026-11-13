const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&amp;/g, "&");
}

function stripHtml(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|h\d|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const httpsFallback = require("./fetch-https.cjs");

const doFetch =
  typeof fetch === "function" ? (url, opts) => fetch(url, opts) : (url, opts) => httpsFallback.request(url, opts);

async function fetchText(url, opts = {}) {
  const { headers = {}, tries = 3, timeoutMs = 30000, method = "GET", body } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await doFetch(url, {
        method,
        body,
        signal: ctrl ? ctrl.signal : undefined,
        headers: {
          "User-Agent": DEFAULT_UA,
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
          ...headers,
        },
      });
      const text = await res.text();
      if (timer) clearTimeout(timer);
      if (res.status >= 500 && attempt < tries) {
        lastErr = new Error("HTTP " + res.status);
        await sleep(1200 * attempt);
        continue;
      }
      return { status: res.status, text, headers: res.headers };
    } catch (e) {
      if (timer) clearTimeout(timer);
      lastErr = e;
      if (attempt < tries) await sleep(1200 * attempt);
    }
  }
  throw lastErr || new Error("fetch failed");
}

async function fetchJson(url, opts = {}) {
  const { status, text } = await fetchText(url, opts);
  try {
    return { status, json: JSON.parse(text) };
  } catch (e) {
    throw new Error("bad JSON from " + url + ": " + text.slice(0, 120));
  }
}

module.exports = { DEFAULT_UA, sleep, decodeEntities, stripHtml, fetchText, fetchJson };
