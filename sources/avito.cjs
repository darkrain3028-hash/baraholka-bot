const { fetchText, stripHtml } = require("../lib/http.cjs");

const SEARCH =
  "https://www.avito.ru/tolyatti/vakansii?q=%D1%83%D0%B4%D0%B0%D0%BB%D0%B5%D0%BD%D0%BD%D0%B0%D1%8F+%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%B0";

function extractJson(html) {
  const m = html.match(/window\.__initialData__\s*=\s*"([^"]+)"/);
  if (!m) return null;
  try {
    const raw = m[1];
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch (e) {
    return null;
  }
}

function walk(node, out, depth) {
  if (!node || depth > 12) return;
  if (Array.isArray(node)) {
    for (const x of node) walk(x, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  if (node.type === "job" && (node.id || node.urlPath)) out.push(node);
  for (const k of Object.keys(node)) walk(node[k], out, depth + 1);
}

async function collect() {
  const { status, text } = await fetchText(SEARCH, { tries: 1 });
  if (status !== 200) {
    const blocked = /проверка безопасности|Доступ ограничен/i.test(text);
    throw new Error(
      "avito: HTTP " + status + (blocked ? " (антибот-страница, нужен браузер)" : "")
    );
  }

  const data = extractJson(text);
  const items = [];
  if (data) walk(data, items, 0);
  if (!items.length) {
    const cards = text.match(/data-marker="item"[^>]*>[\s\S]{0,2000}?<\/div>/g) || [];
    if (!cards.length) throw new Error("avito: не удалось разобрать выдачу");
  }

  return items.map((it) => ({
    source: "avito",
    id: String(it.id || ""),
    url: it.urlPath ? "https://www.avito.ru" + it.urlPath : "",
    title: it.title || "",
    company: (it.companyName || it.company || "") + "",
    area: "Тольятти",
    salary: null,
    remote: true,
    workFormats: ["REMOTE"],
    experienceRaw: "",
    schedule: "",
    description: stripHtml(it.description || ""),
    publishedAt: "",
    civilLaw: false,
    employmentForm: "",
  }));
}

module.exports = { collect };
