const { esc } = require("./telegram.cjs");

const MAX_LEN = 3600;

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function itemLine(v) {
  const salary = v.salary ? v.salary + " · " : "";
  return (
    "• " +
    esc(v.title) +
    " — " +
    esc(v.company || "компания не указана") +
    "\n   " +
    esc(salary + (v.conditions || "")) +
    "\n   " +
    v.url
  );
}

function buildReport(items, hours, minScore, maxScore = 10) {
  const list = items.filter((v) => v.score >= minScore && v.score <= maxScore);
  const head =
    "<b>Вакансии за " +
    hours +
    " " +
    plural(hours, "час", "часа", "часов") +
    "</b>";

  if (!list.length) {
    return [
      head +
        "\nПодходящих вакансий с оценкой от " +
        minScore +
        " до 10 пока нет. Бот собирает их каждый час.",
    ];
  }

  const counts = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => [s, list.filter((v) => v.score === s).length]);
  const summary = counts
    .filter(([, n]) => n > 0)
    .map(([s, n]) => s + "/10 — " + n)
    .join(", ");

  const blocks = [];
  let current = head + "\nВсего: " + list.length + " · " + esc(summary);
  for (const score of [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
    const group = list.filter((v) => v.score === score);
    if (!group.length || score < minScore || score > maxScore) continue;
    let section = "\n\n<b>Оценка " + score + "/10</b> (" + group.length + ")\n" + group.map(itemLine).join("\n\n");
    if ((current + section).length > MAX_LEN) {
      blocks.push(current);
      current = "<b>Оценка " + score + "/10</b> (продолжение)\n" + group.map(itemLine).join("\n\n");
      section = "";
    }
    if (section) current += section;
    else if (!current.startsWith("<b>Оценка")) current = current.trim();
  }
  blocks.push(current);
  return blocks.filter(Boolean);
}

module.exports = { buildReport, itemLine };
