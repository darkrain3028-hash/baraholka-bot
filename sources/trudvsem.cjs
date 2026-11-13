const { fetchJson, stripHtml } = require("../lib/http.cjs");

const API = "https://opendata.trudvsem.ru/api/v1/vacancies";

function salaryOf(v) {
  const min = Number(v.salary_min) || null;
  const max = Number(v.salary_max) || null;
  if (!min && !max) return null;
  return { from: min, to: max, currency: v.currency || "RUR", gross: true, mode: "MONTH" };
}

function experienceOf(v) {
  const e = v.requirement && v.requirement.experience;
  if (e === 0 || e === "0") return "none";
  if (e == null) return "";
  return "between1And3";
}

function normalize(v) {
  const duty = stripHtml(v.duty || "");
  const req = stripHtml(v.requirement ? Object.values(v.requirement).join(" ") : "");
  return {
    source: "trudvsem",
    id: String(v.id),
    url: v.vac_url || "",
    title: v["job-name"] || "",
    company: (v.company && v.company.name) || "",
    area: (v.region && v.region.name) || "",
    salary: salaryOf(v),
    remote: /удал[её]н/i.test([v.schedule, v.workPlaceType, duty].filter(Boolean).join(" ")),
    workFormats: [v.workPlaceType || "", v.schedule || ""].filter(Boolean),
    experienceRaw: experienceOf(v),
    schedule: v.schedule || "",
    description: duty + "\n" + req,
    publishedAt: v["creation-date"] || "",
    civilLaw: false,
    employmentForm: v.employment || "",
  };
}

async function collect({ limit = 100 } = {}) {
  const url = API + "?limit=" + limit + "&offset=0&text=" + encodeURIComponent("удаленно");
  const { status, json } = await fetchJson(url, { tries: 2 });
  if (status !== 200) throw new Error("trudvsem: HTTP " + status);
  const list = (json.results && json.results.vacancies) || [];
  return list.map((w) => normalize(w.vacancy || w)).filter((v) => v.id && v.url);
}

module.exports = { collect, normalize };
