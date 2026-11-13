function mainMenu() {
  return {
    inline_keyboard: [
      [
        { text: "📋 Все за 24 часа", callback_data: "list:1:10" },
        { text: "⭐ 8–10", callback_data: "list:8:10" },
      ],
      [
        { text: "🔹 6–7", callback_data: "list:6:7" },
        { text: "📊 Статус", callback_data: "status" },
      ],
      [{ text: "🔄 Обновить сейчас", callback_data: "list:1:10" }],
    ],
  };
}

module.exports = { mainMenu };
