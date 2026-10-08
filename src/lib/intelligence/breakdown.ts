/**
 * Sugestões de “quebrar em passos”. Heurística local e conservadora:
 * o objetivo é só tornar o PRIMEIRO passo óbvio e pequeno.
 */
import { normalize } from "./heuristic/parse";

const RULES: [RegExp, (obj: string) => string[]][] = [
  [/^pagar\s+(.*)/, (o) => [`Achar o boleto/fatura de ${o}`, "Pagar no app do banco", "Marcar como pago aqui"]],
  [/^responder\s+(.*)/, (o) => [`Reler a mensagem de ${o}`, "Escrever 3 linhas de rascunho", "Enviar"]],
  [/^(?:resolver|declarar|ver)\s+(?:o\s+|a\s+)?imposto/, () => ["Separar os documentos numa pasta", "Mandar dúvidas para a contadora", "Pagar ou enviar a declaração"]],
  [/^(?:terminar|finalizar|concluir)\s+(.*)/, (o) => [`Abrir ${o} e listar o que falta (10 min)`, "Fazer o menor item da lista", "Testar e anotar onde parei"]],
  [/^(?:configurar|instalar|integrar)\s+(.*)/, (o) => [`Ler o que ${o} precisa (10 min)`, "Fazer a configuração mínima", "Testar com um caso real"]],
  [/^marcar\s+(.*)/, (o) => [`Achar o contato para ${o}`, "Ligar ou mandar mensagem", "Colocar a data no app"]],
  [/^(?:escrever|criar|preparar|montar)\s+(.*)/, (o) => [`Rascunho feio de ${o} (15 min)`, "Completar as partes que faltam", "Revisar uma vez e fechar"]],
  [/^(?:organizar|arrumar|limpar)\s+(.*)/, (o) => [`Escolher um canto pequeno de ${o}`, "15 min de timer", "Parar e decidir se continua"]],
];

export function suggestSteps(title: string): string[] {
  const t = normalize(title.trim());
  for (const [re, make] of RULES) {
    const m = t.match(re);
    if (m) {
      const obj = (m[1] ?? "").trim();
      // reaproveita o trecho original (com acentos) quando possível
      const original = obj ? title.trim().slice(title.trim().length - obj.length) : "";
      return make(original || obj || "isso");
    }
  }
  return [
    `Definir o primeiro passo físico de “${title.trim()}” (5 min)`,
    "Trabalhar 25 minutos nisso",
    "Anotar onde parei",
  ];
}
