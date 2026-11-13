const path = require("path");
const { config, ensureData } = require("./config.cjs");
const { readJson, writeJson } = require("./lib/store.cjs");
const { Telegram } = require("./lib/telegram.cjs");
const { buildReport } = require("./lib/report.cjs");
const { mainMenu } = require("./lib/keyboard.cjs");
const { sleep } = require("./lib/http.cjs");
const { fetchEvaluated } = require("./collect.cjs");

const CMD_RX = /^\/?(список|вакансии|отчёт|отчет|list|report)(?:@\w+)?(?:\s+(\d{1,2}))?\s*$/i;
const CACHE_MS = 3 * 60 * 1000;

function helpText() {
  return (
    "<b>Что умею</b>\n" +
    "Кнопки ниже — всё то же, что команды, только без набора текста.\n\n" +
    "«Все за 24 часа» — обхожу hh, Трудвсем и Хабр прямо сейчас и присылаю вакансии " +
    "за последние " +
    config.reportHours +
    " ч с оценкой 1–10.\n" +
    "«8–10» / «6–7» — только выбранный диапазон оценки.\n" +
    "«Статус» — очередь и история.\n\n" +
    "Команды тоже работают: «список» и «список 7».\n" +
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

  allowedUser(user) {
    if (!this.adminId) return true;
    return !!user && String(user.id) === String(this.adminId);
  }

  async reply(update, text, opts = {}) {
    const msg = update.message || update.channel_post || (update.callback_query && update.callback_query.message);
    const source = msg.chat;
    const isChannel = source.type === "channel";

    if (isChannel) {
      if (this.adminId) {
        try {
          await this.tg.sendMessage(this.adminId, text, opts);
          return;
        } catch (e) {
          /* нет доступа в личку — отвечаем в канал */
        }
      }
      await this.tg.sendMessage(source.id, text);
      return;
    }

    await this.tg.sendMessage(source.id, text, opts);
  }

  async liveItems() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.items;
    const { items } = await fetchEvaluated();
    const fresh = items.filter((it) => publishedWithin(it, this.hours));
    this.cache = { at: Date.now(), items: fresh };
    return fresh;
  }

  async handleList(update, minScore, maxScore = 10) {
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
      const blocks = buildReport(items, this.hours, minScore, maxScore);
      for (let i = 0; i < blocks.length; i++) {
        const last = i === blocks.length - 1;
        await this.reply(update, blocks[i], last ? { replyMarkup: mainMenu() } : {});
        await sleep(400);
      }
    } catch (e) {
      console.error("listener: живой сбор не удался —", e.message);
      await this.reply(update, "Площадки не ответили, попробуйте через пару минут.", {
        replyMarkup: mainMenu(),
      });
    } finally {
      this.collecting = false;
    }
  }

  async sendStatus(update) {
    const seen = (readJson(path.join(this.dataDir, "seen.json"), { ids: [] }).ids || []).length;
    const queue = (readJson(path.join(this.dataDir, "queue.json"), []) || []).length;
    const text =
      "<b>Статус</b>\n" +
      "В очереди на публикацию: " +
      queue +
      "\nУже видел вакансий: " +
      seen +
      "\nСобираю раз в " +
      config.collectIntervalMin +
      " мин, публикую раз в " +
      config.postIntervalMin +
      " мин\nПорог публикации: " +
      config.minScore +
      " из 10";
    await this.reply(update, text, { replyMarkup: mainMenu() });
  }

  async handleCallback(update) {
    const cb = update.callback_query;
    const data = String(cb.data || "");
    const wrap = { callback_query: cb };

    if (!this.allowedUser(cb.from)) {
      await this.tg.answerCallback(cb.id, "Кнопки доступны только владельцу бота");
      return;
    }

    if (data === "status") {
      await this.tg.answerCallback(cb.id);
      await this.sendStatus(wrap);
      return;
    }

    const m = data.match(/^list:(\d{1,2}):(\d{1,2})$/);
    if (!m) {
      await this.tg.answerCallback(cb.id, "Неизвестная кнопка");
      return;
    }

    await this.tg.answerCallback(cb.id, "Собираю вакансии…");
    await this.handleList(wrap, Number(m[1]), Number(m[2]));
  }

  async handle(update) {
    if (update.callback_query) {
      await this.handleCallback(update);
      return;
    }

    const msg = update.message || update.channel_post;
    if (!msg || !msg.text) return;
    const text = String(msg.text).trim();
    if (!this.allowed(msg)) return;

    if (/^\/?(start|help|помощь|меню|menu)\b/i.test(text)) {
      await this.reply(update, helpText(), { replyMarkup: mainMenu() });
      return;
    }

    const m = text.match(CMD_RX);
    if (!m) {
      if (update.message && update.message.chat.type === "private") {
        await this.reply(update, "Выберите, что прислать:", { replyMarkup: mainMenu() });
      }
      return;
    }

    const minScore = m[2] ? Number(m[2]) : 1;
    await this.handleList(update, minScore, 10);
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
    try {
      await this.tg.setCommands([
        { command: "start", description: "Меню с кнопками" },
        { command: "list", description: "Список вакансий за сутки" },
      ]);
    } catch (e) {
      /* кнопка меню не критична */
    }
    let offset = this.getOffset();

    while (this.running) {
      try {
        const updates = await this.tg.call("getUpdates", {
          offset,
          timeout: 50,
          allowed_updates: ["message", "channel_post", "callback_query"],
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
