const fs = require("fs");
const path = require("path");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error("store: cannot read", path.basename(file), "-", e.message);
    return fallback;
  }
}

function writeJson(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.files = {
      seen: path.join(dir, "seen.json"),
      queue: path.join(dir, "queue.json"),
      published: path.join(dir, "published.json"),
      manual: path.join(dir, "manual-queue.json"),
      log: path.join(dir, "log.txt"),
    };
  }

  seen() {
    const d = readJson(this.files.seen, { ids: [] });
    return new Set(d.ids || []);
  }

  saveSeen(set) {
    writeJson(this.files.seen, { ids: Array.from(set).slice(-5000) });
  }

  queue() {
    return readJson(this.files.queue, []);
  }

  saveQueue(list) {
    writeJson(this.files.queue, list);
  }

  published() {
    return readJson(this.files.published, []);
  }

  savePublished(list) {
    writeJson(this.files.published, list.slice(-500));
  }

  manual() {
    return readJson(this.files.manual, []);
  }

  saveManual(list) {
    writeJson(this.files.manual, list);
  }

  log(line) {
    const stamp = new Date().toISOString();
    try {
      fs.appendFileSync(this.files.log, stamp + " " + line + "\n", "utf8");
    } catch (e) {
      /* лог не критичен */
    }
  }
}

module.exports = { Store, readJson, writeJson };
