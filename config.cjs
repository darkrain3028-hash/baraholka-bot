const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");

function readEnv() {
  const env = {};
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return env;
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

const env = readEnv();

for (const key of ["BRIDGE_URL", "BOT_TOKEN", "CHANNEL", "ADMIN_ID"]) {
  if (env[key] && !process.env[key]) process.env[key] = env[key];
}

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const config = {
  token: env.BOT_TOKEN || process.env.BOT_TOKEN || "",
  channel: env.CHANNEL || process.env.CHANNEL || "",
  adminId: env.ADMIN_ID || process.env.ADMIN_ID || "",

  minScore: num(env.MIN_SCORE, 3),
  maxPostsPerRun: num(env.MAX_POSTS_PER_RUN, 3),
  postIntervalMin: num(env.POST_INTERVAL_MIN, 25),
  reportHours: num(env.REPORT_HOURS, 24),
  collectIntervalMin: num(env.COLLECT_INTERVAL_MIN, 60),

  profile: {
    enabled: (env.PROFILE_ENABLED || "1") !== "0",
    titleRx: env.PROFILE_TITLE_RX || "верстк|вёрстк|верстальщик|верстальщица|frontend|фронтенд|html|css|web-?разработ|веб-?разработ|лендинг|landing",
  },

  hh: {
    enabled: (env.HH_ENABLED || "1") !== "0",
    area: env.HH_AREA || "113",
    queries: (env.HH_QUERIES || "верстальщик,верстка")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    pages: num(env.HH_PAGES, 3),
    perPage: num(env.HH_PER_PAGE, 50),
    maxDetails: num(env.HH_MAX_DETAILS, 45),
    pauseMs: num(env.HH_PAUSE_MS, 900),
  },

  trudvsem: {
    enabled: (env.TRUDVSEM_ENABLED || "1") !== "0",
    limit: 100,
  },

  avito: {
    enabled: (env.AVITO_ENABLED || "1") !== "0",
  },
};

function ensureData() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  return DATA;
}

module.exports = { config, env, ROOT, DATA, ensureData };
