const { config } = require("./config.cjs");
const { Telegram } = require("./lib/telegram.cjs");

async function main() {
  console.log("1. Настройки");
  console.log("   токен:", config.token ? "задан" : "НЕ задан");
  console.log("   канал:", config.channel || "НЕ задан");
  console.log("   админ:", config.adminId || "НЕ задан");

  if (!config.token) {
    console.log("\nБез токена проверять нечего.");
    return;
  }

  console.log("\n2. Связь с Telegram");
  const tg = new Telegram(config.token);
  const started = Date.now();
  try {
    const me = await tg.getMe();
    console.log("   связь есть, бот @" + me.username + " (" + Math.round((Date.now() - started) / 1000) + " с)");
  } catch (e) {
    console.log("   связи нет:", e.message);
    console.log("   вывод: api.telegram.org недоступен с этого компьютера.");
    return;
  }

  console.log("\n3. Доступ к каналу");
  try {
    const chat = await tg.call("getChat", { chat_id: config.channel });
    console.log("   канал найден: " + (chat.title || chat.username || chat.id));
    const me = await tg.getMe();
    const member = await tg.call("getChatMember", { chat_id: config.channel, user_id: me.id });
    const canPost = member.status === "administrator" && member.can_post_messages !== false;
    console.log("   статус бота: " + member.status + (canPost ? ", может публиковать" : ", публикация запрещена"));
  } catch (e) {
    console.log("   ошибка доступа:", e.message);
    console.log("   проверьте, что бот добавлен администратором канала с правом публикации.");
  }
}

main().catch((e) => {
  console.error("проверка не удалась:", e.message);
  process.exitCode = 1;
});
