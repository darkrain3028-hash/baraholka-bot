const { config, ensureData } = require("./config.cjs");
const { Store } = require("./lib/store.cjs");
const { Telegram } = require("./lib/telegram.cjs");

const store = new Store(ensureData());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(opts = {}) {
  const dry = opts.dry !== undefined ? opts.dry : process.argv.includes("--dry");
  const force = opts.force !== undefined ? opts.force : process.argv.includes("--force");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = opts.limit !== undefined ? opts.limit : limitArg ? Number(limitArg.split("=")[1]) : config.maxPostsPerRun;

  const published = store.published();
  const lastAt = published.length ? new Date(published[published.length - 1].at).getTime() : 0;
  const waitMs = config.postIntervalMin * 60 * 1000;
  const sinceLast = Date.now() - lastAt;

  const manual = store.manual();
  const queue = store.queue();

  const outbox = [];
  for (const m of manual) outbox.push({ ...m, kind: "manual" });
  for (const q of queue) outbox.push({ ...q, kind: "queue" });

  if (!outbox.length) {
    console.log("очередь пуста");
    return;
  }

  if (!dry && !force && sinceLast < waitMs) {
    const left = Math.ceil((waitMs - sinceLast) / 60000);
    console.log("пауза между постами: следующий через " + left + " мин");
    return;
  }

  const tg = config.token ? new Telegram(config.token) : null;
  if (!dry && !tg) {
    console.log("BOT_TOKEN не задан — показываю пост, но не публикую");
  }
  if (!dry && tg && !config.channel) {
    console.log("CHANNEL не задан — показываю пост, но не публикую");
  }

  let sent = 0;
  for (const item of outbox) {
    if (sent >= limit) break;
    const text = item.post || item.text || item.line || "";
    if (!text) continue;

    if (dry) {
      console.log("\n========== " + (item.score ? item.score + "/5 " : "") + (item.title || "") + " ==========");
      console.log(text.replace(/<\/?b>/g, ""));
      sent++;
      continue;
    }

    if (!tg || !config.channel) break;

    try {
      const msg = await tg.sendMessage(config.channel, text);
      published.push({
        key: item.key || item.id || "manual",
        at: new Date().toISOString(),
        messageId: msg.message_id,
        title: item.title || "",
        score: item.score || null,
        text,
      });
      store.savePublished(published);
      store.log("published " + (item.key || "manual") + " msg=" + msg.message_id);
      if (item.kind === "manual") store.saveManual(store.manual().filter((m) => m.id !== item.id));
      else store.saveQueue(store.queue().filter((q) => q.key !== item.key));
      sent++;
      console.log("опубликовано:", item.title || item.key);
      if (sent < limit) await sleep(config.postIntervalMin * 60 * 1000);
    } catch (e) {
      const net = /fetch failed|abort|timeout/i.test(e.message);
      console.error(
        net
          ? "Telegram недоступен — посты остаются в очереди, отправлю при следующем цикле"
          : "не удалось опубликовать: " + e.message
      );
      if (tg && !net) await tg.sendToAdmin("Бот не смог опубликовать пост: " + e.message);
      break;
    }
  }

  if (dry) console.log("\n(черновик: ничего не отправлено)");
  else console.log("отправлено:", sent, "| осталось в очереди:", store.queue().length);
  return sent;
}

if (require.main === module) {
  run().catch((e) => {
    console.error("публикация остановлена:", e.message);
    process.exitCode = 1;
  });
}

module.exports = { run };
