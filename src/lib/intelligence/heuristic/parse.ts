/**
 * Interpretador heurístico (pt-BR), 100% local.
 *
 * Não tenta ser perfeito: extrai o óbvio (datas, valores, tipo, área, projeto,
 * pessoas) e explica o que entendeu. Qualquer coisa ambígua fica na Inbox para
 * você confirmar. Um provider LLM pode substituí-lo pela mesma interface.
 */
import { addDays, addMonths, fromISODate, monthEnd, monthStart, toISODate, weekStart } from "@/lib/domain/dates";
import { parseBRL } from "@/lib/domain/money";
import type {
  Area,
  ISODate,
  Interpretation,
  ItemDraft,
  ItemKind,
  Priority,
  Project,
  RecurrenceFreq,
} from "@/lib/domain/types";
import type { CaptureInterpreter, InterpretContext } from "../types";

/* ---------------------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------------------- */

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const ACTION_VERBS = [
  "ver",
  "pagar",
  "ligar",
  "responder",
  "marcar",
  "agendar",
  "comprar",
  "enviar",
  "mandar",
  "fazer",
  "terminar",
  "olhar",
  "resolver",
  "checar",
  "revisar",
  "falar",
  "pedir",
  "buscar",
  "levar",
  "cancelar",
  "renovar",
  "atualizar",
  "organizar",
  "preparar",
  "escrever",
  "criar",
  "estudar",
  "ler",
  "lembrar",
  "conferir",
  "cobrar",
  "receber",
  "configurar",
  "testar",
  "corrigir",
  "arrumar",
  "limpar",
  "trocar",
  "devolver",
  "separar",
  "postar",
  "publicar",
];

const VERB_RE = ACTION_VERBS.join("|");

/** Divide uma captura em cláusulas independentes. */
export function splitClauses(text: string): string[] {
  const parts = text
    .split(/\n|;|\s+\+\s+/)
    .flatMap((p) =>
      p.split(new RegExp(`\\s*(?:,\\s*|\\s+)(?:e|tamb[eé]m|e tamb[eé]m|depois)\\s+(?=(?:${VERB_RE})\\b)`, "i")),
    )
    .flatMap((p) => p.split(new RegExp(`,\\s+(?=(?:${VERB_RE})\\b)`, "i")))
    .map((p) => p.trim())
    .filter((p) => p.length > 1);
  return parts.length ? parts : [text.trim()];
}

const FILLERS = [
  /^(?:eu\s+)?(?:preciso|tenho que|tenho de|devo|quero|queria|vou|precisa)\s+(?:de\s+)?/i,
  /^n[aã]o\s+esquecer\s+(?:de\s+)?/i,
  /^lembrar\s+(?:de|que)\s+/i,
  /^lembrete:?\s*/i,
  /^(?:tem que|tenho q|preciso q)\s+/i,
];

function stripFillers(s: string): { text: string; wasReminder: boolean } {
  let out = s.trim();
  let wasReminder = /^(lembrar|lembrete|n[aã]o esquecer)/i.test(out);
  for (let i = 0; i < 3; i++) {
    for (const re of FILLERS) out = out.replace(re, "");
  }
  if (/^lembrar$/i.test(out)) wasReminder = true;
  return { text: out.trim(), wasReminder };
}

/**
 * Procura `re` no texto sem acentos/minúsculo e corta o mesmo trecho do texto
 * original. Funciona porque o texto é NFC e remover diacríticos de NFD mantém
 * o mesmo número de caracteres — e evita o problema de `\b` com “ã”, “á”…
 */
export function findAndCut(text: string, re: RegExp): { m: RegExpMatchArray; original: string; rest: string } | null {
  const norm = normalize(text);
  const m = norm.match(re);
  if (!m || m.index === undefined) return null;
  const original = text.slice(m.index, m.index + m[0].length);
  const rest = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, " ").trim();
  return { m, original, rest };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanTitle(s: string): string {
  return capitalize(
    s
      .replace(/\s{2,}/g, " ")
      .replace(/^(?:e|de|da|do|a|o|que)\s+/i, "")
      .replace(/\s+(?:e|de|da|do|na|no|até|ate|pra|para|a|o|em)$/i, "")
      .replace(/[\s,.;:-]+$/, "")
      .trim(),
  );
}

/* ---------------------------------------------------------------------------
 * Datas
 * ------------------------------------------------------------------------- */

const NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  dez: 10,
  quinze: 15,
};

/** “de manhã”, “à tarde”, “depois do almoço”… — viram “hoje” se não houver outra data. */
export function extractPeriod(text: string): Extract<string | null> {
  const hit = findAndCut(
    text,
    /\b(?:hoje\s+)?(?:de\s+manha|pela\s+manha|a\s+tarde|de\s+tarde|a\s+noite|de\s+noite|depois\s+do\s+almoco|antes\s+do\s+almoco|cedo)\b/i,
  );
  if (!hit) return { value: null, rest: text };
  return { value: hit.original.trim(), rest: hit.rest };
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

interface DateHit {
  date: ISODate;
  /** “até”, “vence”, “esse mês” indicam prazo; caso contrário é dia planejado */
  isDeadline: boolean;
  label: string;
}

function nextWeekday(today: ISODate, weekday: number, forceNextWeek = false): ISODate {
  const cur = fromISODate(today).getDay();
  let delta = (weekday - cur + 7) % 7;
  if (forceNextWeek) {
    const nextMonday = addDays(weekStart(today), 7);
    return addDays(nextMonday, (weekday + 6) % 7);
  }
  if (delta === 0) delta = 0; // “sexta” dito na sexta = hoje
  return addDays(today, delta);
}

interface Extract<T> {
  value: T;
  rest: string;
}

const DEADLINE_PREFIX = String.raw`(?:at[eé]\s+(?:o\s+|a\s+)?|vence\s+(?:na\s+|no\s+|em\s+)?|vencimento\s+|prazo\s+(?:at[eé]\s+)?)`;

export function extractDate(text: string, today: ISODate): Extract<DateHit | null> {
  const patterns: {
    re: RegExp;
    resolve: (m: RegExpMatchArray) => { date: ISODate; label: string; deadline?: boolean } | null;
  }[] = [
    {
      // daqui 15 dias / daqui a 2 semanas / em 3 dias / dentro de um mês
      re: new RegExp(
        String.raw`\b(${DEADLINE_PREFIX})?(?:daqui\s+(?:a\s+)?|em\s+|dentro\s+de\s+)(\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|dez|quinze)\s+(dias?|semanas?|mes|meses)\b`,
        "i",
      ),
      resolve: (m) => {
        const n = /^\d+$/.test(m[2]) ? Number(m[2]) : NUMBER_WORDS[m[2]];
        if (!n) return null;
        const unit = m[3].startsWith("dia") ? "dias" : m[3].startsWith("semana") ? "semanas" : "meses";
        const date =
          unit === "dias" ? addDays(today, n) : unit === "semanas" ? addDays(today, n * 7) : addMonths(today, n);
        return { date, label: `daqui ${n} ${n === 1 ? unit.replace(/s$/, "").replace("mese", "mês") : unit}` };
      },
    },
    {
      re: new RegExp(String.raw`\b(${DEADLINE_PREFIX})?(?:no\s+)?(?:mes\s+que\s+vem|proximo\s+mes)\b`, "i"),
      resolve: () => ({ date: monthStart(addMonths(today, 1)), label: "mês que vem" }),
    },
    {
      re: new RegExp(String.raw`\b(${DEADLINE_PREFIX})?depois\s+de\s+amanh[aã]\b`, "i"),
      resolve: () => ({ date: addDays(today, 2), label: "depois de amanhã" }),
    },
    {
      re: new RegExp(String.raw`\b(${DEADLINE_PREFIX})?amanh[aã]\b`, "i"),
      resolve: () => ({ date: addDays(today, 1), label: "amanhã" }),
    },
    {
      re: new RegExp(String.raw`\b(${DEADLINE_PREFIX})?hoje\b`, "i"),
      resolve: () => ({ date: today, label: "hoje" }),
    },
    {
      re: new RegExp(
        String.raw`\b(${DEADLINE_PREFIX})?(?:(?:esse|este|nesse|neste|no)\s+m[eê]s|(?:o\s+)?(?:fim|final)\s+do\s+m[eê]s)\b`,
        "i",
      ),
      resolve: () => ({ date: monthEnd(today), label: "até o fim do mês", deadline: true }),
    },
    {
      re: new RegExp(
        String.raw`\b(${DEADLINE_PREFIX})?(?:(?:na\s+)?semana\s+que\s+vem|(?:na\s+)?pr[oó]xima\s+semana)\b`,
        "i",
      ),
      resolve: () => ({ date: addDays(weekStart(today), 7), label: "semana que vem" }),
    },
    {
      re: new RegExp(String.raw`\b(${DEADLINE_PREFIX})?(?:(?:nesse|neste|esse|este|no)\s+)?fim\s+de\s+semana\b`, "i"),
      resolve: () => ({ date: nextWeekday(today, 6), label: "fim de semana" }),
    },
    {
      // 15/10 ou 15/10/2026
      re: new RegExp(String.raw`\b(${DEADLINE_PREFIX})?(?:dia\s+)?(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b`, "i"),
      resolve: (m) => {
        const day = Number(m[2]);
        const month = Number(m[3]);
        let year = m[4] ? Number(m[4]) : fromISODate(today).getFullYear();
        if (year < 100) year += 2000;
        if (day < 1 || day > 31 || month < 1 || month > 12) return null;
        let date = toISODate(new Date(year, month - 1, day));
        if (!m[4] && date < today) date = toISODate(new Date(year + 1, month - 1, day));
        return { date, label: `${day}/${month}` };
      },
    },
    {
      // dia 15
      re: new RegExp(String.raw`\b(${DEADLINE_PREFIX})?dia\s+(\d{1,2})\b`, "i"),
      resolve: (m) => {
        const day = Number(m[2]);
        if (day < 1 || day > 31) return null;
        const t = fromISODate(today);
        let d = new Date(t.getFullYear(), t.getMonth(), day);
        if (toISODate(d) < today) d = new Date(t.getFullYear(), t.getMonth() + 1, day);
        return { date: toISODate(d), label: `dia ${day}` };
      },
    },
    {
      re: new RegExp(
        String.raw`\b(${DEADLINE_PREFIX})?(?:(?:na|no|nesta|neste|nessa|nesse|essa|esse|esta|este)\s+)?(pr[oó]xim[ao]\s+)?(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:[-\s]feira)?(?:\s+que\s+vem)?\b`,
        "i",
      ),
      resolve: (m) => {
        const key = normalize(m[3]);
        const wd = WEEKDAYS[key];
        if (wd === undefined) return null;
        const forceNext = !!m[2] || /que\s+vem/i.test(m[0]);
        return { date: nextWeekday(today, wd, forceNext), label: { sabado: "sábado", terca: "terça" }[key] ?? key };
      },
    },
  ];

  for (const p of patterns) {
    const hit = findAndCut(text, p.re);
    if (!hit) continue;
    const r = p.resolve(hit.m);
    if (!r) continue;
    const isDeadline = !!hit.m[1] || !!r.deadline;
    return { value: { date: r.date, isDeadline, label: r.label }, rest: hit.rest };
  }
  return { value: null, rest: text };
}

export function extractTime(text: string): Extract<string | null> {
  const hit =
    findAndCut(text, /\b(?:as?\s+)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?:min)?\b/i) ??
    // “às 9” (sem “h”) — só com “às”, para não confundir com quantidades
    findAndCut(text, /\bas\s+(\d{1,2})\b(?!\s*(?:dias?|semanas?|reais|horas?|\/))/i);
  if (!hit) return { value: null, rest: text };
  const h = Number(hit.m[1]);
  const min = Number(hit.m[2] ?? hit.m[3] ?? 0);
  if (h > 23 || min > 59) return { value: null, rest: text };
  return { value: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, rest: hit.rest };
}

export function extractMoney(text: string): Extract<number | null> {
  const hit =
    findAndCut(text, /(?:\bde\s+)?r\$\s*([\d.]+(?:,\d{1,2})?)/i) ??
    findAndCut(text, /(?:\bde\s+)?\b([\d.]+(?:,\d{1,2})?)\s*(?:reais|conto|pila)\b/i);
  if (!hit) return { value: null, rest: text };
  const cents = parseBRL(hit.m[1]);
  if (cents === null || cents === 0) return { value: null, rest: text };
  return { value: cents, rest: hit.rest };
}

export function extractRecurrence(text: string): Extract<RecurrenceFreq | null> {
  const rules: [RegExp, RecurrenceFreq][] = [
    [/\b(?:todo\s+dia|todos\s+os\s+dias|diariamente|di[aá]ri[oa])\b/i, "daily"],
    [/\b(?:toda\s+semana|todas\s+as\s+semanas|semanalmente|semanal)\b/i, "weekly"],
    [/\b(?:todo\s+m[eê]s|todos\s+os\s+meses|mensalmente|mensal)\b/i, "monthly"],
    [/\b(?:todo\s+ano|anualmente|anual)\b/i, "yearly"],
  ];
  for (const [re, freq] of rules) {
    const hit = findAndCut(text, re);
    if (hit) return { value: freq, rest: hit.rest };
  }
  // “toda segunda” → semanal (o dia em si fica para o extrator de datas)
  const wd = findAndCut(text, /\btoda\s+(?=(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b)/i);
  if (wd) return { value: "weekly", rest: wd.rest };
  return { value: null, rest: text };
}

/* ---------------------------------------------------------------------------
 * Classificação
 * ------------------------------------------------------------------------- */

const FINANCE_WORDS =
  /\b(pagar|pagamento|conta\s+de|boleto|fatura|cart[aã]o|aluguel|imposto|impostos|ipva|iptu|das|darf|irpf|mensalidade|assinatura|cobran[cç]a|banco|pix|transfer[eê]ncia|nota\s+fiscal|nf|condom[ií]nio|financiamento|parcela|reembolso|receber|recebimento|or[cç]amento|hospedagem|dom[ií]nio)\b/i;
const WORK_WORDS =
  /\b(cliente|clientes|reuni[aã]o|projeto|deploy|webhook|servidor|vps|configura[cç][aã]o|proposta|site|api|bug|c[oó]digo|contrato|landing|campanha|marketing|apresenta[cç][aã]o|relat[oó]rio|planilha|e-?mail\s+do|call|sprint|feature|integra[cç][aã]o|beds24|airbnb|booking)\b/i;
const EVENT_WORDS =
  /\b(reuni[aã]o|consulta|dentista|m[eé]dic[oa]|call|almo[cç]o\s+com|jantar\s+com|caf[eé]\s+com|entrevista|anivers[aá]rio|festa|exame|aula|voo|viagem|evento|encontro)\b/i;

const PERSON_STOP = new Set([
  "o",
  "a",
  "os",
  "as",
  "e",
  "de",
  "do",
  "da",
  "pra",
  "para",
  "que",
  "email",
  "e-mail",
  "mensagem",
  "msg",
  "whatsapp",
  "zap",
  "proposta",
  "cliente",
  "hoje",
  "amanha",
  "amanhã",
  "sobre",
  "ele",
  "ela",
]);

const NOT_PEOPLE = new Set([
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
  "deus",
]);

export function extractPeople(text: string, projects: Project[] = []): string[] {
  const people = new Set<string>();
  const projectWords = new Set(
    projects.flatMap((p) => [p.name, ...(p.aliases ?? [])]).flatMap((n) => normalize(n).split(/\s+/)),
  );
  // nomes próprios depois de preposições: “pro Rafael”, “com a Ana”
  for (const m of text.matchAll(/\b(?:pro|pra|para|com|ao|à)\s+(?:o\s+|a\s+)?([A-ZÀ-Ý][a-zà-ÿ]{2,})\b(?![\wà-ÿ])/g)) {
    const n = normalize(m[1]);
    if (NOT_PEOPLE.has(n) || projectWords.has(n) || PERSON_STOP.has(n)) continue;
    people.add(m[1]);
  }
  const re =
    /\b(?:responder|ligar\s+(?:pra|para|pro)|falar\s+com|mandar\s+(?:mensagem|msg|e-?mail|zap|whats(?:app)?)\s+(?:pra|para|pro)|cobrar|encontrar|reuni[aã]o\s+com|almo[cç]o\s+com|caf[eé]\s+com|jantar\s+com|call\s+com|avisar|perguntar\s+(?:pra|para|pro|a|ao))\s+(?:o\s+|a\s+)?([A-Za-zÀ-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?)/gi;
  for (const m of text.matchAll(re)) {
    const name = m[1].trim();
    if (PERSON_STOP.has(normalize(name.split(" ")[0]))) continue;
    people.add(capitalize(name));
  }
  return [...people];
}

export function matchProject(text: string, projects: Project[]): Project | null {
  const t = normalize(text);
  let best: { p: Project; len: number } | null = null;
  for (const p of projects) {
    if (p.status === "done") continue;
    for (const name of [p.name, ...(p.aliases ?? [])]) {
      const n = normalize(name).trim();
      if (n.length < 3) continue;
      const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(t) && (!best || n.length > best.len)) best = { p, len: n.length };
    }
  }
  return best?.p ?? null;
}

interface Classification {
  kind: ItemKind;
  intent: Interpretation["intent"];
  area: Area;
  direction?: "in" | "out";
}

export function classify(
  text: string,
  opts: { hasTime: boolean; hasDate: boolean; wasReminder: boolean },
): Classification {
  const t = normalize(text);
  const has = (re: RegExp) => re.test(t);

  if (/^(ideia|idea)\b|\bideia\s+(?:para|pra|de)\b/.test(t)) {
    return { kind: "idea", intent: "idea", area: WORK_WORDS.test(t) ? "work" : "personal" };
  }
  if (has(/^(?:meta|objetivo)\b/))
    return { kind: "goal", intent: "do", area: FINANCE_WORDS.test(t) ? "finance" : "personal" };
  if (has(/\b(receber|recebimento|vou\s+receber|entra(?:r)?\s+(?:o\s+)?(?:pagamento|dinheiro))\b/)) {
    return { kind: "income", intent: "receive", area: "finance", direction: "in" };
  }
  if (has(/\b(pagar|boleto|fatura|vence|vencimento|parcela)\b/) || has(/^conta\s+(?:de|da|do)\b/)) {
    return { kind: "bill", intent: "pay", area: "finance", direction: "out" };
  }
  if (has(/^(?:comprar|compra|comprei)\b/) || has(/\b(supermercado|mercado|farm[aá]cia)\b/)) {
    return { kind: "shopping", intent: "buy", area: "personal" };
  }
  if (has(/^(?:gastei|paguei)\b/)) return { kind: "expense", intent: "pay", area: "finance", direction: "out" };
  if (!has(/^(?:marcar|agendar|desmarcar|remarcar)\b/) && EVENT_WORDS.test(t) && (opts.hasTime || opts.hasDate)) {
    return { kind: "event", intent: "meet", area: WORK_WORDS.test(t) ? "work" : "personal" };
  }
  if (has(/^(?:responder|aprovar|decidir|escolher)\b/)) {
    return { kind: "task", intent: "decide", area: WORK_WORDS.test(t) ? "work" : "personal" };
  }
  const area: Area = FINANCE_WORDS.test(t) ? "finance" : WORK_WORDS.test(t) ? "work" : "personal";
  if (opts.wasReminder && t.split(" ").length <= 6 && !has(new RegExp(`^(?:${VERB_RE})\\b`))) {
    return { kind: "reminder", intent: "remember", area };
  }
  return { kind: "task", intent: "do", area };
}

function detectPriority(text: string): { priority: Priority; rest: string } {
  const high = /\b(urgente|urgentissimo|importantissimo|importante|prioridade)\b|!{2,}/i;
  const low = /\b(algum\s+dia|talvez|sem\s+pressa|quando\s+der)\b/i;
  let rest = text;
  let priority: Priority = "normal";
  for (let hit = findAndCut(rest, high); hit; hit = findAndCut(rest, high)) {
    priority = "high";
    rest = hit.rest;
  }
  if (priority === "normal") {
    const hit = findAndCut(rest, low);
    if (hit) {
      priority = "low";
      rest = hit.rest;
    }
  }
  return { priority, rest: rest.replace(/[!]+/g, "").trim() };
}

/* ---------------------------------------------------------------------------
 * Interpretação completa
 * ------------------------------------------------------------------------- */

/**
 * “sexta preciso pagar a VPS e terminar o checkout” — a data vem ANTES do
 * “preciso”. Separa essa data inicial (vale para a frase toda) do resto.
 */
const LEADING_DATE_RE = /^(.{2,24}?)\s+(?=(?:eu\s+)?(?:preciso|tenho que|tenho de|devo|quero|vou|precisa)\b)/i;

export function splitLeadingDate(text: string, today: ISODate): { hit: DateHit; rest: string } | null {
  const m = text.match(LEADING_DATE_RE);
  if (!m) return null;
  const found = extractDate(m[1], today);
  if (!found.value || found.rest.trim()) return null;
  return { hit: found.value, rest: text.slice(m[0].length) };
}

export function interpretText(raw: string, ctx: InterpretContext): Interpretation {
  let text = raw.normalize("NFC").trim();
  const lead = splitLeadingDate(text, ctx.today);
  // a data inicial vai para o fim da primeira cláusula e vale para as seguintes sem data própria
  if (lead) text = `${lead.rest} ${text.slice(0, text.length - lead.rest.length).trim()}`.trim();
  const clauses = splitClauses(text);
  const notes: string[] = [];
  const drafts: ItemDraft[] = [];
  const intents: Interpretation["intent"][] = [];
  let confidence = 0.55;

  // data/projeto citados numa cláusula valem para a anterior quando ela não tem
  let sharedProject: Project | null = matchProject(text, ctx.projects);

  for (const clause of clauses) {
    const { text: base, wasReminder } = stripFillers(clause);
    let rest = base;

    const pr = detectPriority(rest);
    rest = pr.rest;
    const rec = extractRecurrence(rest);
    rest = rec.rest;
    const money = extractMoney(rest);
    rest = money.rest;
    const time = extractTime(rest);
    rest = time.rest;
    const date = extractDate(rest, ctx.today);
    rest = date.rest;
    const period = extractPeriod(rest);
    rest = period.rest;
    if (!date.value && period.value) {
      date.value = { date: ctx.today, isDeadline: false, label: period.value.toLowerCase() };
    }
    if (!date.value && lead && clauses.length > 1) date.value = lead.hit;

    const cls = classify(base, { hasTime: !!time.value, hasDate: !!date.value, wasReminder });
    const project = matchProject(clause, ctx.projects) ?? (clauses.length === 1 ? sharedProject : null);
    if (project) sharedProject = project;

    if (cls.kind === "idea") {
      // “ideia para o Zeloa: X” → título “X” (o projeto já fica vinculado)
      const m = rest.match(/^ideia\b[^:]*:\s*(.+)$/i);
      if (m) rest = m[1];
    }

    const draft: ItemDraft = {
      title: cleanTitle(rest) || cleanTitle(base) || capitalize(text),
      kind: cls.kind,
      area: project && cls.area !== "finance" ? project.area : cls.area,
      priority: pr.priority,
      projectId: project?.id ?? null,
      people: extractPeople(base, ctx.projects),
      startTime: time.value,
    };

    if (date.value) {
      const asDeadline = date.value.isDeadline || cls.kind === "bill" || cls.kind === "income";
      if (cls.kind === "event") draft.scheduledDate = date.value.date;
      else if (asDeadline) draft.dueDate = date.value.date;
      else draft.scheduledDate = date.value.date;
      notes.push(
        `“${date.value.label}” → ${asDeadline && cls.kind !== "event" ? "prazo" : "dia"} ${date.value.date.slice(8, 10)}/${date.value.date.slice(5, 7)}`,
      );
      confidence += 0.1;
    } else if (time.value && cls.kind === "event") {
      draft.scheduledDate = ctx.today;
    }

    if (money.value !== null || cls.direction) {
      draft.money = {
        amountCents: money.value ?? 0,
        direction: cls.direction ?? "out",
        category: guessCategory(base),
      };
      if (money.value === null) notes.push("Sem valor — dá pra completar depois");
    }
    if (rec.value) {
      draft.recurrence = { freq: rec.value };
      notes.push(
        `Repete: ${{ daily: "todo dia", weekly: "toda semana", monthly: "todo mês", yearly: "todo ano" }[rec.value]}`,
      );
    }
    if (project) notes.push(`Projeto: ${project.name}`);
    if (draft.people?.length) notes.push(`Pessoa: ${draft.people.join(", ")}`);
    if (cls.kind !== "task") confidence += 0.1;

    drafts.push(draft);
    intents.push(cls.intent);
  }

  if (drafts.length > 1) {
    notes.unshift(`Separei em ${drafts.length} itens`);
    confidence -= 0.1;
  }

  const intent = drafts.length === 1 ? intents[0] : "do";
  return {
    source: "heuristic",
    intent,
    drafts,
    confidence: Math.max(0.2, Math.min(confidence, 0.9)),
    notes,
  };
}

export function guessCategory(text: string): string | undefined {
  const t = normalize(text);
  const map: [RegExp, string][] = [
    [/\b(cartao|fatura)\b/, "Cartão"],
    [/\b(aluguel|condominio|iptu|luz|agua|gas|internet)\b/, "Casa"],
    [/\b(imposto|das|darf|irpf|ipva)\b/, "Impostos"],
    [/\b(vps|hospedagem|dominio|servidor|assinatura|software|saas)\b/, "Ferramentas"],
    [/\b(mercado|supermercado|farmacia|shampoo)\b/, "Mercado"],
    [/\b(medico|dentista|consulta|exame|plano de saude)\b/, "Saúde"],
    [/\b(cliente|projeto|freela|reserva|hospede)\b/, "Trabalho"],
  ];
  return map.find(([re]) => re.test(t))?.[1];
}

export const heuristicInterpreter: CaptureInterpreter = {
  id: "heuristic",
  label: "Interpretação local (sem IA)",
  async interpret(text, ctx) {
    return interpretText(text, ctx);
  },
};
