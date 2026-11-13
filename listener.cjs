const path = require("path");
const { config, ensureData } = require("./config.cjs");
const { readJson, writeJson } = require("./lib/store.cjs");
const { Telegram } = require("./lib/telegram.cjs");
const { buildReport } = require("./lib/report.cjs");
const { sleep } = require("./lib/http.cjs");
const { fetchEvaluated } = require("./collect.cjs");

const CMD_RX = /^\/?(список|вакансии|отчёт|отчет|list|report)(?:@\w+)?(?:\s+(\d))?\s*$/i;
const CACHE_MS = 3 * 60 * 1000;

function helpText() {
  return (
    "<b>Что умею</b>\n" +
    "«список» — прямо сейчас обхожу hh, Трудвсем и Авито и присылаю все вакансии " +
    "за последние " +
    config.reportHours +
    " ч с оценкой 1–5\n" +
    "«список 4» — только с оценкой 4 и 5\n" +
    "Плюс каждый час собираю вакансии и публикую подходящие в канал."
  );
}

function publishedWithin(item, hours) {
  if (!item.publishedAt) return true;
  const t = new Date(item.publishedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t <= hours * 3600 * 1000;
}

class Listener {
  constructor({ token, adminId, hours }) {
    this.tg = new Telegram(token);
    this.adminId = adminId;
    this.hours = hours;
    this.dataDir = ensureData();
    this.offsetFile = path.join(this.dataDir, "offset.json");
    this.running = false;
    this.collecting = false;
    this.cache = null;
  }

  getOffset() {
    return readJson(this.offsetFile, { offset: 0 }).offset || 0;
  }

  setOffset(v) {
    writeJson(this.offsetFile, { offset: v });
  }

  allowed(message) {
    if (!this.adminId) return true;
    const from = message.from && String(message.from.id);
    if (from === String(this.adminId)) return true;
    if (message.sender_chat && String(message.sender_chat.id) === String(this.adminId)) return true;
    return false;
  }

  async reply(update, text) {
    const msg = update.message || update.channel_post;
    const source = msg.chat;
    const isChannel = source.type === "channel";

    if (isChannel) {
      if (this.adminId) {
        try {
          await this.tg.sendMessage(this.adminId, text);
          return;
        } catch (e) {
          /* нет доступа в личку — отвечаем в канал */
        }
      }
      await this.tg.sendMessage(source.id, text);
      return;
    }

    await this.tg.sendMessage(source.id, text);
  }

  async liveItems() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.items;
    const { items } = await fetchEvaluated();
    const fresh = items.filter((it) => publishedWithin(it, this.hours));
    this.cache = { at: Date.now(), items: fresh };
    return fresh;
  }

  async handleList(update, minScore) {
    if (this.collecting) {
      await this.reply(update, "Уже собираю вакансии, пришлю список через минуту.");
      return;
    }

    this.collecting = true;
    try {
      const cached = this.cache && Date.now() - this.cache.at < CACHE_MS;
      if (!cached) {
        await this.reply(update, "Обхожу площадки, это займёт до двух минут…");
      }
      const items = await this.liveItems();
      const blocks = buildReport(items, this.hours, minScore);
      for (const block of blocks) {
        await this.reply(update, block);
        await sleep(400);
      }
    } catch (e) {
      console.error("listener: живой сбор не удался —", e.message);
      await this.reply(update, "Площадки не ответили, попробуйте через пару минут.");
    } finally {
      this.collecting = false;
    }
  }

  async handle(update) {
    const msg = update.message || update.channel_post;
    if (!msg || !msg.text) return;
    const text = String(msg.text).trim();
    if (!this.allowed(msg)) return;

    if (/^\/?(start|help|помощь)\b/i.test(text)) {
      await this.reply(update, helpText());
      return;
    }

    const m = text.match(CMD_RX);
    if (!m) return;

    const minScore = m[2] ? Number(m[2]) : 1;
    await this.handleList(update, minScore);
  }

  async start() {
    this.running = true;
    let me = null;
    let warn = 0;
    while (!me && this.running) {
      try {
        me = await this.tg.getMe();
      } catch (e) {
        warn++;
        if (warn === 1 || warn % 10 === 0) {
          console.log("listener: Telegram недоступен (" + e.message + "), повторяю каждую минуту");
        }
        await sleep(60000);
      }
    }
    if (!me) return;
    console.log("listener: бот @" + me.username + " слушает команды");
    let offset = this.getOffset();

    while (this.running) {
      try {
        const updates = await this.tg.call("getUpdates", {
          offset,
          timeout: 50,
          allowed_updates: ["message", "channel_post"],
        });
        for (const u of updates || []) {
          offset = u.update_id + 1;
          this.setOffset(offset);
          try {
            await this.handle(u);
          } catch (e) {
            console.error("listener: ошибка команды —", e.message);
          }
        }
      } catch (e) {
        console.error("listener: сбой опроса —", e.message);
        await sleep(5000);
      }
    }
  }

  stop() {
    this.running = false;
  }
}

function startListener() {
  if (!config.token) {
    console.log("listener: BOT_TOKEN не задан, команды не принимаются");
    return null;
  }
  const l = new Listener({
    token: config.token,
    adminId: config.adminId,
    hours: config.reportHours,
  });
  l.start().catch((e) => console.error("listener остановлен:", e.message));
  return l;
}

if (require.main === module) {
  const l = startListener();
  if (!l) process.exit(1);
  process.on("SIGINT", () => {
    l.stop();
    process.exit(0);
  });
}

module.exports = { Listener, startListener, helpText };
