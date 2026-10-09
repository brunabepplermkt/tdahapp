/**
 * Texto ditado → texto escrito. O reconhecimento de voz entrega palavras sem
 * pontuação; aqui entram os comandos falados mais úteis para uma lista:
 * “nova linha”, “vírgula”, “ponto final”, “interrogação”.
 */

const NEWLINE = /\s*\b(?:nova|próxima|proxima)\s+(?:linha|item)\b[\s,.]*/gi;
const COMMA = /\s*\bv[ií]rgula\b\s*/gi;
const PERIOD = /\s*\bponto\s+final\b\s*/gi;
const QUESTION = /\s*\binterroga[cç][aã]o\b\s*/gi;

export function applyVoiceCommands(raw: string): string {
  return raw
    .replace(NEWLINE, "\n")
    .replace(COMMA, ", ")
    .replace(PERIOD, ". ")
    .replace(QUESTION, "? ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/g, "");
}

/** Junta um trecho ditado ao texto que já existe, cuidando de espaços e linhas. */
export function appendDictation(current: string, chunk: string): string {
  const add = applyVoiceCommands(chunk);
  if (!add.trim()) return current;
  if (!current.trim()) return add.replace(/^\s+/, "");
  const sep = current.endsWith("\n") || add.startsWith("\n") ? "" : " ";
  return `${current}${sep}${add}`;
}
