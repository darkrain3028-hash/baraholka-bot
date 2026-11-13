const { config, ensureData } = require("./config.cjs");
const { Store } = require("./lib/store.cjs");
const { evaluate } = require("./lib/score.cjs");
const { postFrom, shortLine, salaryLine, conditions } = require("./lib/format.cjs");
const { VacancyLog } = require("./lib/vacancies.cjs");
const hh = require("./sources/hh.cjs");
const trudvsem = require("./sources/trudvsem.cjs");
const avito = require("./sources/avito.cjs");

const store = new Store(ensureData());
const vacancyLog = new VacancyLog(ensureData());

async function collectAll() {
  const all = [];

  if (config.hh.enabled) {
    try {
      const { details } = await hh.collect(config.hh);
      console.log("hh: просмотрено карточек", details.length);
      all.push(...details);
    } catch (e) {
      console.error("hh: сбой сбора —", e.message);
    }
  }

  if (config.trudvsem.enabled) {
    try {
      const list = await trudvsem.collect(config.trudvsem);
      console.log("trudvsem: карточек", list.length);
      all.push(...list);
    } catch (e) {
      console.error("trudvsem: сбой сбора —", e.message);
    }
  }

  if (config.avito.enabled) {
    try {
      const list = await avito.collect();
      console.log("avito: карточек", list.length);
      all.push(...list);
    } catch (e) {
      console.log("avito: пропущен —", e.message);
    }
  }

  return all;
}

function describe(v, res) {
  return {
    key: v.source + ":" + v.id,
    score: res.score,
    at: new Date().toISOString(),
    publishedAt: v.publishedAt || "",
    source: v.source,
    title: v.title,
    company: v.company,
    salary: salaryLine(v.salary),
    conditions: conditions(res),
    url: v.url,
    city: v.area || "",
  };
}

async function fetchEvaluated() {
  const vacancies = await collectAll();
  const items = [];
  const rejects = {};
  let rejected = 0;

  for (const v of vacancies) {
    if (!v.id || !v.url) continue;
    const res = evaluate(v);
    if (!res.ok) {
      rejected++;
      rejects[res.reason] = (rejects[res.reason] || 0) + 1;
      continue;
    }
    const base = describe(v, res);
    items.push({ ...base, post: postFrom(res), line: shortLine(res), notes: res.notes });
  }

  return { items, rejected, rejects, scanned: vacancies.length };
}

async function run(opts = {}) {
  const dryRun = opts.dryRun !== undefined ? opts.dryRun : process.argv.includes("--dry");
  const verbose = opts.verbose !== undefined ? opts.verbose : process.argv.includes("--verbose");

  const seen = store.seen();
  const queue = store.queue();
  const queuedIds = new Set(queue.map((q) => q.key));

  const { items, rejects, scanned } = await fetchEvaluated();
  console.log("всего карточек:", scanned, "| прошли фильтры:", items.length);

  let added = 0;
  let rejected = 0;
  const fresh = [];

  for (const it of items) {
    if (seen.has(it.key) || queuedIds.has(it.key)) continue;
    seen.add(it.key);

    if (it.score < config.minScore) {
      rejected++;
      rejects["низкая оценка"] = (rejects["низкая оценка"] || 0) + 1;
      if (verbose) console.log("  ниже порога:", it.score + "/5", it.title);
      continue;
    }

    queue.push({
      key: it.key,
      score: it.score,
      addedAt: it.at,
      source: it.source,
      url: it.url,
      title: it.title,
      company: it.company,
      post: it.post,
      line: it.line,
    });
    queuedIds.add(it.key);
    added++;
    fresh.push(it);
  }

  store.saveQueue(queue);
  store.saveSeen(seen);
  vacancyLog.add(items);

  console.log("добавлено в очередь:", added, "| отклонено:", rejected);
  if (Object.keys(rejects).length) {
    console.log("причины отказа:", Object.entries(rejects).map(([k, n]) => k + " — " + n).join(", "));
  }

  if (dryRun || verbose) {
    for (const it of fresh.slice(0, 20)) {
      console.log("\n----- " + it.score + "/5 -----");
      console.log(it.title + " | " + it.company);
      console.log(it.url);
    }
  }

  console.log("\nв очереди всего:", store.queue().length);
  return { added, rejected };
}

if (require.main === module) {
  run().catch((e) => {
    console.error("сбор остановлен:", e.message);
    process.exitCode = 1;
  });
}

module.exports = { run, fetchEvaluated, collectAll };
