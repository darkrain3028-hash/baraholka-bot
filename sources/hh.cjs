const { fetchText, decodeEntities, stripHtml, sleep } = require("../lib/http.cjs");

const BASE = "https://hh.ru";

function stateFromHtml(html) {
  const m = html.match(/<template[^>]*id="HH-Lux-InitialState"[^>]*>([\s\S]*?)<\/template>/);
  if (!m) return null;
  try {
    return JSON.parse(decodeEntities(m[1]));
  } catch (e) {
    return null;
  }
}

async function search({ area = "212", page = 0, perPage = 50 } = {}) {
  const url =
    BASE +
    "/search/vacancy?area=" +
    encodeURIComponent(area) +
    "&schedule=remote&order_by=publication_time&items_on_page=" +
    perPage +
    "&page=" +
    page;
  const { status, text } = await fetchText(url, { tries: 2 });
  if (status !== 200) throw new Error("hh search: HTTP " + status);
  const state = stateFromHtml(text);
  const vsr = state && state.vacancySearchResult;
  const items = (vsr && vsr.vacancies) || [];
  return items
    .filter((v) => v && v.vacancyId)
    .map((v) => ({
      id: String(v.vacancyId),
      title: v.name || "",
      company: (v.company && (v.company.visibleName || v.company.name)) || "",
      url: BASE + "/vacancy/" + v.vacancyId,
    }));
}

function salaryOf(comp) {
  if (!comp) return null;
  const from = Number(comp.from) || null;
  const to = Number(comp.to) || null;
  if (!from && !to) return null;
  const mode = comp.mode || "MONTH";
  return {
    from,
    to,
    currency: comp.currencyCode || "RUR",
    gross: comp.gross !== false,
    mode,
  };
}

function contractOf(v) {
  const c = v.civilLawContracts;
  const types = Array.isArray(c) ? c.filter(Boolean) : [];
  return {
    civilLawTypes: types,
    employmentForm: v.employmentForm || "",
  };
}

async function detail(id) {
  const { status, text } = await fetchText(BASE + "/vacancy/" + id, { tries: 2 });
  if (status !== 200) return null;
  const state = stateFromHtml(text);
  const vf = state && state.vacancyView && state.vacancyView.vacancyFull;
  const v = vf && vf.vacancy;
  if (!v) return null;

  const company = v.company || {};
  const contracts = contractOf(v);

  return {
    source: "hh",
    id: String(v.vacancyId || id),
    url: BASE + "/vacancy/" + (v.vacancyId || id),
    title: v.name || "",
    company: company.visibleName || company.name || "",
    companyId: company.id || null,
    area: (v.area && v.area.name) || "",
    salary: salaryOf(v.compensation),
    remote: Array.isArray(v.workFormats) && v.workFormats.includes("REMOTE"),
    workFormats: v.workFormats || [],
    experienceRaw: v.workExperience || "",
    schedule: (v.workScheduleByDays || []).join(","),
    description: stripHtml(v.description || ""),
    publishedAt: v.publicationTimeIso || "",
    civilLawTypes: contracts.civilLawTypes,
    employmentForm: contracts.employmentForm,
  };
}

async function collect({ area, pages, perPage, maxDetails, pauseMs }) {
  const found = new Map();
  for (let page = 0; page < pages; page++) {
    let list = [];
    try {
      list = await search({ area, page, perPage });
    } catch (e) {
      console.error("hh: страница " + page + " не получена:", e.message);
      break;
    }
    for (const v of list) if (!found.has(v.id)) found.set(v.id, v);
    if (list.length < perPage) break;
    await sleep(Math.max(400, pauseMs));
  }

  const brief = Array.from(found.values()).slice(0, maxDetails);
  const out = [];
  for (const b of brief) {
    try {
      const d = await detail(b.id);
      if (d) out.push(d);
    } catch (e) {
      console.error("hh: вакансия " + b.id + " не открылась:", e.message);
    }
    await sleep(pauseMs);
  }
  return { brief: Array.from(found.values()), details: out };
}

module.exports = { collect, search, detail };
