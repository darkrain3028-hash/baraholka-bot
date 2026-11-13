const { fetchJson } = require("./http.cjs");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

class Telegram {
  constructor(token) {
    this.token = token;
    this.base = "https://api.telegram.org/bot" + token + "/";
  }

  async call(method, payload = {}) {
    if (!this.token) throw new Error("BOT_TOKEN не задан в .env");
    const { json } = await fetchJson(this.base + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      tries: 2,
    });
    if (!json.ok) {
      const desc = (json.description || "").slice(0, 200);
      throw new Error("telegram " + method + " failed: " + desc);
    }
    return json.result;
  }

  getMe() {
    return this.call("getMe");
  }

  async sendMessage(chatId, html, opts = {}) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: false, prefer_large_media: false },
      disable_notification: !!opts.silent,
    });
  }

  async sendToAdmin(html) {
    if (!this.adminId) return null;
    try {
      return await this.sendMessage(this.adminId, html, { silent: true });
    } catch (e) {
      return null;
    }
  }
}

module.exports = { Telegram, esc };
