const BANK_RX =
  /(банк|bank|сбер|тинькофф|т-?банк|втб|альфа|росбанк|открытие|совкомбанк|газпромбанк|райффайзен|почта\s?банк|мтс\s?банк|озон\s?банк|точка\s?банк|хоум\s?кредит|русский\s?стандарт|уралсиб|ак\s?барс|абсолют|ренессанс|дельт?акредит|россельхоз|промсвязь|возрождение|союз|инвест|страхов)/i;

const TELECOM_RX =
  /(мтс|мегафон|билайн|теле2|\bt2\b|ростелеком|йота|yota|телесеть|оператор\s+связи|связь|дом\.?ру|тинькофф\s?мобайл)/i;

const SELF_EMPLOYED_RX =
  /(самозанят|самозанятост|нпд\b|налог на профессиональный доход|гпх|гражданско-?правов|договор подряда|договор оказания услуг|по договору услуг|как ип\b|статус ип\b|оформление ип|ип или самозанят|самозанят\w* или ип)/i;

const NO_CALLS_RX =
  /(без звонков|звонков нет|без обзвона|без холодных звонков|не нужно звонить|не требуется звонить|общение только в чате|без телефонных переговоров)/i;

const CALLS_RX =
  /(звонк|обзвон|прозвон|холодн\w* звон|телефонн\w* переговор|исходящ\w* звон|созвон)/i;

const FIELD_WORK_RX =
  /(курьер|водител|экспедитор|разъездн|на личном автомобил|личном авто|выезд\w* на объект|полев\w* работ|работа на объектах|мобильн\w* сотрудник)/i;

const NO_EXP_RX =
  /(без опыта|опыт не требуется|не требуется опыт|опыт работы не важен|без опыта работы|можно без опыта)/i;

const EXPERIENCE_LABEL = {
  noExperience: "без опыта",
  between1And3: "опыт 1–3 года",
  between3And6: "опыт 3–6 лет",
  moreThan6: "опыт больше 6 лет",
  "": "",
};

const CONTRACT_TEXT = {
  selfEmployed: "самозанятость",
  selfEmployedOrIp: "самозанятость или ИП",
  gph: "ГПХ",
};
function detectContract(v) {
  const types = Array.isArray(v.civilLawTypes) ? v.civilLawTypes : [];
  const self = types.includes("SELF_EMPLOYED");
  const ip = types.includes("INDIVIDUAL_ENTREPRENEUR");
  if (self && ip) return { ok: true, label: CONTRACT_TEXT.selfEmployedOrIp };
  if (self) return { ok: true, label: CONTRACT_TEXT.selfEmployed };
  if (ip) return { ok: true, label: CONTRACT_TEXT.selfEmployedOrIp };

  const text = (v.description || "") + " " + (v.title || "");
  const m = text.match(SELF_EMPLOYED_RX);
  if (!m) return { ok: false };
  const hit = m[0].toLowerCase();
  if (/самозанят/.test(hit) && /ип/.test(text.toLowerCase())) {
    return { ok: true, label: CONTRACT_TEXT.selfEmployedOrIp };
  }
  if (/самозанят|нпд|профессиональный доход/.test(hit)) return { ok: true, label: CONTRACT_TEXT.selfEmployed };
  if (/гпх|гражданско|подряда|оказания услуг/.test(hit)) return { ok: true, label: CONTRACT_TEXT.gph };
  if (/ип/.test(hit)) return { ok: true, label: CONTRACT_TEXT.selfEmployedOrIp };
  return { ok: false };
}

function detectExperience(v) {
  let raw = v.experienceRaw || "";
  if (!raw) {
    const t = (v.description || "").toLowerCase();
    if (NO_EXP_RX.test(t)) raw = "noExperience";
    else if (/опыт\s+(от\s+)?1|1[–-]3\s+год/.test(t)) raw = "between1And3";
    else if (/опыт\s+(от\s+)?3|3[–-]6\s+лет/.test(t)) raw = "between3And6";
    else if (/опыт\s+(от\s+)?6|более\s+6\s+лет/.test(t)) raw = "moreThan6";
  }
  return raw || "noExperience";
}

function detectCalls(v) {
  const text = (v.description || "") + " " + (v.title || "");
  if (NO_CALLS_RX.test(text)) return false;
  return CALLS_RX.test(text);
}

function evaluate(v) {
  const reject = (reason) => ({ ok: false, score: 0, reason, vacancy: v });

  if (BANK_RX.test(v.company || "")) return reject("банк или финансовая организация");
  if (TELECOM_RX.test(v.company || "")) return reject("оператор связи");
  if (/банк|оператор связи/i.test(v.title || "") && !/не банк/i.test(v.title || "")) {
    return reject("банк или связь в названии вакансии");
  }

  const remote =
    v.remote === true ||
    (Array.isArray(v.workFormats) && v.workFormats.some((f) => /REMOTE|удал/i.test(String(f)))) ||
    /удал[её]нн?\w*/i.test((v.description || "") + " " + (v.schedule || ""));
  if (!remote) return reject("не удалёнка");

  const contract = detectContract(v);
  if (!contract.ok) return reject("нет самозанятости или ГПХ");

  if (FIELD_WORK_RX.test(v.title || "")) return reject("разъездная работа, не из дома");
  if (/выезд\w* на объект|на личном автомобил|разъездн/i.test(v.description || "")) {
    return reject("разъездная работа, не из дома");
  }

  const experience = detectExperience(v);
  if (experience === "moreThan6") return reject("требуется опыт больше 6 лет");

  const calls = detectCalls(v);

  let score = 5;
  const notes = [];
  if (experience === "between1And3") {
    score -= 1;
    notes.push("опыт 1–3 года");
  } else if (experience === "between3And6") {
    score -= 2;
    notes.push("опыт 3–6 лет");
  } else {
    notes.push("без опыта");
  }
  if (calls) {
    score -= 2;
    notes.push("есть звонки");
  } else {
    notes.push("звонков нет");
  }

  score = Math.max(1, Math.min(5, score));

  return {
    ok: true,
    score,
    contract: contract.label,
    experience,
    experienceLabel: EXPERIENCE_LABEL[experience] || "",
    calls,
    notes,
    vacancy: v,
  };
}

module.exports = { evaluate, detectContract, detectCalls, detectExperience, BANK_RX, TELECOM_RX };
