/**
 * Despejo mental: o texto solto vira uma lista separada por tipo.
 * 100% local e conservador — o usuário sempre revisa antes de guardar.
 */
import type { ItemDraft } from "@/lib/domain/types";
import { interpretText, normalize } from "./heuristic/parse";
import type { InterpretContext } from "./types";

export type DumpBucket = "task" | "event" | "idea" | "worry" | "buy" | "money";

export interface DumpEntry {
  id: string;
  /** a linha como foi escrita */
  text: string;
  bucket: DumpBucket;
  /** rascunho estruturado (para worry fica só o título) */
  draft: ItemDraft;
}

const WORRY_RE =
  /\b(preocup\w*|ansios\w*|ansiedade|medo|receio|nervos\w*|estress\w*|angusti\w*|culpa|vergonha|e se\b|sera que|tenho medo|me sinto|tô mal|to mal|nao aguento|sobrecarreg\w*)/;

/** Quebra o texto em linhas/itens: uma por linha, por “;” ou por marcador de lista. */
export function splitDump(text: string): string[] {
  return text
    .split(/\n|;/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 1);
}

function bucketOf(text: string, draft: ItemDraft): DumpBucket {
  if (WORRY_RE.test(normalize(text))) return "worry";
  switch (draft.kind) {
    case "event":
      return "event";
    case "idea":
      return "idea";
    case "shopping":
      return "buy";
    case "bill":
    case "expense":
    case "income":
      return "money";
    default:
      return "task";
  }
}

export function sortDump(text: string, ctx: InterpretContext): DumpEntry[] {
  const out: DumpEntry[] = [];
  let n = 0;
  for (const line of splitDump(text)) {
    const worry = WORRY_RE.test(normalize(line));
    if (worry) {
      out.push({
        id: `d${n++}`,
        text: line,
        bucket: "worry",
        draft: { title: line, kind: "idea", area: "personal", priority: "low" },
      });
      continue;
    }
    // uma linha pode render vários itens (“ligar pro João e pagar a luz”)
    for (const draft of interpretText(line, ctx).drafts) {
      out.push({ id: `d${n++}`, text: draft.title, bucket: bucketOf(line, draft), draft });
    }
  }
  return out;
}

export const BUCKET_LABEL: Record<DumpBucket, string> = {
  task: "Fazer",
  event: "Compromissos",
  money: "Dinheiro",
  buy: "Comprar",
  idea: "Ideias",
  worry: "Preocupações",
};

export const BUCKET_ORDER: DumpBucket[] = ["task", "event", "money", "buy", "idea", "worry"];
