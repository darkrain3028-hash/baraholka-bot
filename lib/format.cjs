const { esc } = require("./telegram.cjs");

function money(n) {
  return Math.round(n).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

function salaryLine(s) {
  if (!s) return "зарплата не указана";
  const { from, to, gross } = s;
  const fmt = (x) => (x >= 1000 ? Math.round(x / 1000) + " тыс ₽" : money(x) + " ₽");
  let body;
  if (from && to && from !== to) body = fmt(from) + " – " + fmt(to);
  else if (from && to && from === to) body = fmt(from);
  else if (from) body = "от " + fmt(from);
  else body = "до " + fmt(to);
  if (s.mode && s.mode !== "MONTH") {
    const map = { HOUR: " в час", DAY: " в день", SHIFT: " за смену", WEEK: " в неделю" };
    return body + (map[s.mode] || "");
  }
  return body + (gross ? " (до вычета)" : " на руки");
}

function conditions(res) {
  if (Array.isArray(res.notes) && res.notes.length) {
    const parts = ["удалённо", res.contract];
    for (const n of res.notes) if (!parts.includes(n)) parts.push(n);
    return parts.join(", ");
  }
  return ["удалённо", "самозанятость", res.experienceLabel || "без опыта", res.calls ? "есть звонки" : "звонков нет"]
    .filter(Boolean)
    .join(", ");
}

function postFrom(result) {
  const v = result.vacancy;
  const lines = [];
  lines.push("<b>Оценка " + result.score + "/10</b>");
  lines.push(esc(v.title) + " — " + esc(v.company || "компания не указана"));
  lines.push("Зарплата: " + esc(salaryLine(v.salary)));
  lines.push("Условия: " + esc(conditions(result)));
  if (v.area) lines.push("Город: " + esc(v.area));
  lines.push("Вакансия: " + v.url);
  return lines.join("\n");
}

function shortLine(result) {
  const v = result.vacancy;
  return [
    "Оценка " + result.score + "/10",
    v.title,
    v.company,
    salaryLine(v.salary),
    conditions(result),
    v.url,
  ]
    .filter(Boolean)
    .join(", ");
}

module.exports = { postFrom, shortLine, salaryLine, conditions };
