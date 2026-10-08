/**
 * Busca global simples: ignora acentos e maiúsculas, todas as palavras
 * precisam aparecer. Procura em itens (inclusive feitos/arquivados), projetos,
 * notas e capturas.
 */
import { normalize } from "@/lib/intelligence/heuristic/parse";
import type { AppData, Capture, Item, Note, Project } from "./types";

export interface SearchResults {
  items: Item[];
  projects: Project[];
  notes: Note[];
  captures: Capture[];
  total: number;
}

const STATUS_RANK: Record<Item["status"], number> = { open: 0, someday: 1, done: 2, archived: 3 };

export function searchAll(data: AppData, query: string, limit = 20): SearchResults {
  const words = normalize(query)
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const empty = { items: [], projects: [], notes: [], captures: [], total: 0 };
  if (words.length === 0) return empty;
  const hit = (...fields: (string | undefined | null)[]) => {
    const hay = normalize(fields.filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  };

  const items = data.items
    .filter((i) => hit(i.title, i.notes, i.people?.join(" "), i.money?.category))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
  const projects = data.projects.filter((p) => hit(p.name, p.currentState, p.aliases?.join(" ")));
  const notes = data.notes
    .filter((n) => hit(n.body))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
  const captures = data.captures.filter((c) => c.status !== "processed" && hit(c.text)).slice(0, limit);
  return { items, projects, notes, captures, total: items.length + projects.length + notes.length + captures.length };
}
