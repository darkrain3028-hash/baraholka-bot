const path = require("path");
const { readJson, writeJson } = require("./store.cjs");

const KEEP_DAYS = 7;

class VacancyLog {
  constructor(dir) {
    this.file = path.join(dir, "vacancies.json");
  }

  all() {
    const d = readJson(this.file, { items: [] });
    return Array.isArray(d.items) ? d.items : [];
  }

  save(items) {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
    const kept = items.filter((v) => new Date(v.at).getTime() >= cutoff);
    writeJson(this.file, { items: kept });
  }

  add(entries) {
    if (!entries.length) return 0;
    const items = this.all();
    const index = new Map(items.map((v) => [v.key, v]));
    let added = 0;
    for (const e of entries) {
      if (!e || !e.key) continue;
      const prev = index.get(e.key);
      index.set(e.key, prev ? { ...prev, ...e } : { ...e, at: e.at || new Date().toISOString() });
      if (!prev) added++;
    }
    this.save(Array.from(index.values()));
    return added;
  }

  recent(hours = 24) {
    const from = Date.now() - hours * 3600 * 1000;
    return this.all()
      .filter((v) => new Date(v.at).getTime() >= from)
      .sort((a, b) => b.score - a.score || new Date(b.at) - new Date(a.at));
  }
}

module.exports = { VacancyLog, KEEP_DAYS };
