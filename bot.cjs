const { config } = require("./config.cjs");
const collect = require("./collect.cjs");
const publish = require("./publish.cjs");
const { startListener } = require("./listener.cjs");

let busy = false;

async function cycle(reason) {
  if (busy) {
    console.log("цикл: предыдущий ещё идёт, пропускаю");
    return;
  }
  busy = true;
  const started = Date.now();
  console.log("\n=== " + new Date().toLocaleString("ru-RU") + " | " + reason);
  try {
    await collect.run({});
    await publish.run({});
  } catch (e) {
    console.error("цикл: ошибка —", e.message);
  } finally {
    busy = false;
    console.log("цикл занял", Math.round((Date.now() - started) / 1000), "с");
  }
}

async function main() {
  console.log("Барахолка: запуск");
  if (!config.token) console.log("BOT_TOKEN не задан: публикации и команды отключены");
  if (!config.channel) console.log("CHANNEL не задан: публикация отключена");

  const listener = startListener();

  await cycle("старт");
  setInterval(() => cycle("по расписанию"), config.collectIntervalMin * 60 * 1000);

  const stop = () => {
    console.log("остановка");
    if (listener) listener.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error("бот остановлен:", e.message);
  process.exitCode = 1;
});
