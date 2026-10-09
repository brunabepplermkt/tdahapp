/**
 * Sugestões de “quebrar em passos”. Heurística local e conservadora:
 * o objetivo é só tornar o PRIMEIRO passo óbvio e pequeno.
 */
import { normalize } from "./heuristic/parse";

const RULES: [RegExp, (obj: string) => string[]][] = [
  [/^pagar\s+(.*)/, (o) => [`Achar o boleto/fatura de ${o}`, "Pagar no app do banco", "Marcar como pago aqui"]],
  [/^responder\s+(.*)/, (o) => [`Reler a mensagem de ${o}`, "Escrever 3 linhas de rascunho", "Enviar"]],
  [
    /^(?:resolver|declarar|ver)\s+(?:o\s+|a\s+)?imposto/,
    () => ["Separar os documentos numa pasta", "Mandar dúvidas para a contadora", "Pagar ou enviar a declaração"],
  ],
  [
    /^(?:terminar|finalizar|concluir)\s+(.*)/,
    (o) => [`Abrir ${o} e listar o que falta (10 min)`, "Fazer o menor item da lista", "Testar e anotar onde parei"],
  ],
  [
    /^(?:configurar|instalar|integrar)\s+(.*)/,
    (o) => [`Ler o que ${o} precisa (10 min)`, "Fazer a configuração mínima", "Testar com um caso real"],
  ],
  [/^marcar\s+(.*)/, (o) => [`Achar o contato para ${o}`, "Ligar ou mandar mensagem", "Colocar a data no app"]],
  [
    /^(?:escrever|criar|preparar|montar)\s+(.*)/,
    (o) => [`Rascunho feio de ${o} (15 min)`, "Completar as partes que faltam", "Revisar uma vez e fechar"],
  ],
  [
    /^(?:organizar|arrumar|limpar)\s+(.*)/,
    (o) => [`Escolher um canto pequeno de ${o}`, "15 min de timer", "Parar e decidir se continua"],
  ],
];

export interface MicroStep {
  title: string;
  /** minutos estimados — cada micropasso cabe em ≤ 10 min; o primeiro em ≤ 2 */
  min: number;
}

/** Tempo estimado de cada passo das regras acima, na mesma ordem. */
const RULE_MINUTES: number[][] = [
  [3, 5, 1],
  [2, 5, 1],
  [5, 5, 5],
  [5, 10, 2],
  [5, 10, 5],
  [3, 3, 1],
  [10, 10, 5],
  [2, 15, 1],
];

/**
 * Quebra uma tarefa em micropassos: o primeiro é sempre minúsculo (≤ 2 min,
 * “só abrir”), para vencer a paralisia de começar; os seguintes têm tempo.
 */
export function suggestMicroSteps(title: string): MicroStep[] {
  const t = normalize(title.trim());
  for (let i = 0; i < RULES.length; i++) {
    const [re, make] = RULES[i];
    const m = t.match(re);
    if (m) {
      const obj = (m[1] ?? "").trim();
      const original = obj ? title.trim().slice(title.trim().length - obj.length) : "";
      const titles = make(original || obj || "isso").map((s) => s.replace(/\s*\(\d+ min\)/, ""));
      return withStarter(titles.map((s, k) => ({ title: s, min: RULE_MINUTES[i][k] ?? 5 })));
    }
  }
  const name = title.trim();
  return [
    { title: `Abrir o que preciso para “${name}” (só abrir)`, min: 1 },
    { title: "Fazer a menor parte possível, mesmo feia", min: 5 },
    { title: "Mais uma rodada de 10 minutos", min: 10 },
    { title: "Anotar onde parei", min: 1 },
  ];
}

/** Garante que o primeiro passo seja de ≤ 2 min; se não for, acrescenta um “só abrir” antes. */
function withStarter(steps: MicroStep[]): MicroStep[] {
  if (steps[0] && steps[0].min <= 2) return steps;
  return [{ title: "Só abrir e olhar, sem resolver nada", min: 1 }, ...steps];
}

export function totalMinutes(steps: MicroStep[]): number {
  return steps.reduce((s, x) => s + x.min, 0);
}

export function suggestSteps(title: string): string[] {
  return suggestMicroSteps(title).map((s) => s.title);
}
