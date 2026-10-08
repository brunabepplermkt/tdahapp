/**
 * Dados FICTÍCIOS para experimentar o app. Tudo é relativo a `today`, então
 * a demo sempre parece “viva”. Nenhum dado real, nenhuma conta real.
 */
import { addDays, monthEnd, monthStart } from "@/lib/domain/dates";
import { newId } from "@/lib/domain/id";
import { addDecision, logActivity, makeItem, type ItemInput } from "@/lib/domain/operations";
import type { AppData, Capture, ISODate, Item, Note, Project } from "@/lib/domain/types";
import { interpretText } from "@/lib/intelligence/heuristic/parse";
import { runAgentRules } from "@/lib/intelligence/rules";

import { CURRENT_VERSION } from "@/lib/store/migrate";

export const DATA_VERSION = CURRENT_VERSION;

export function emptyData(): AppData {
  return { version: DATA_VERSION, items: [], captures: [], projects: [], notes: [], decisions: [], activity: [] };
}

function daysAgoISO(today: ISODate, n: number, hour = 10): string {
  const d = new Date(`${addDays(today, -n)}T${String(hour).padStart(2, "0")}:00:00`);
  return d.toISOString();
}

/** dia `day` do mês corrente (ou do próximo, se `nextIfPast` e já passou) */
function dayOfMonth(today: ISODate, day: number, nextIfPast = false): ISODate {
  const base = monthStart(today);
  let d = addDays(base, day - 1);
  if (nextIfPast && d < today) d = addDays(monthStart(addDays(monthEnd(today), 1)), day - 1);
  return d;
}

export function buildDemoData(today: ISODate): AppData {
  const created = daysAgoISO(today, 6);
  const project = (p: Omit<Project, "createdAt" | "updatedAt">): Project => ({
    ...p,
    createdAt: created,
    updatedAt: created,
  });

  const zeloa = project({
    id: "prj_zeloa",
    name: "Zeloa",
    area: "work",
    status: "active",
    currentState: "MVP rodando com 2 clientes piloto. Falta estabilizar o webhook e fechar o 3º piloto.",
    deadline: addDays(today, 20),
    aliases: [],
  });
  const copiloto = project({
    id: "prj_copiloto",
    name: "Copiloto",
    area: "work",
    status: "active",
    currentState: "Protótipo funciona. Preciso decidir modelo de preço.",
    deadline: null,
  });
  const hub = project({
    id: "prj_hub",
    name: "Marketing Hub",
    area: "work",
    status: "paused",
    currentState: "Pausado até o Zeloa fechar os pilotos.",
    deadline: null,
  });
  const sitio = project({
    id: "prj_sitio",
    name: "Sítio Recanto Azul",
    area: "work",
    status: "active",
    currentState: "Migrando reservas e calendário para o Beds24 antes da alta temporada.",
    deadline: addDays(today, 9),
    aliases: ["Beds24", "sítio", "recanto"],
  });
  const projects = [zeloa, copiloto, hub, sitio];

  const items: Item[] = [];
  const add = (input: ItemInput, opts: { createdDaysAgo?: number; id?: string } = {}) => {
    const at = daysAgoISO(today, opts.createdDaysAgo ?? 3);
    const item = makeItem(input, at);
    if (opts.id) item.id = opts.id;
    items.push(item);
    return item;
  };
  const money = (amountCents: number, direction: "in" | "out", category: string, settled = false) => ({
    amountCents,
    direction,
    category,
    settled,
    settledAt: settled ? daysAgoISO(today, 1) : undefined,
  });

  /* ---------- trabalho ---------- */
  const beds = add(
    {
      title: "Terminar configuração do Beds24",
      kind: "task",
      area: "work",
      projectId: sitio.id,
      priority: "high",
      scheduledDate: today,
      dueDate: addDays(today, 5),
      estimateMin: 90,
      postponeCount: 3,
      notes: "Falta: tarifas de feriado, sincronizar Airbnb, testar uma reserva.",
    },
    { createdDaysAgo: 12 },
  );
  beds.history.push(
    { at: daysAgoISO(today, 7), type: "postponed" },
    { at: daysAgoISO(today, 4), type: "postponed" },
    { at: daysAgoISO(today, 1), type: "postponed" },
  );

  add({
    title: "Ver por que o webhook está falhando",
    kind: "task",
    area: "work",
    projectId: zeloa.id,
    dueDate: addDays(today, 1),
    estimateMin: 60,
    notes: "Erro 500 intermitente no endpoint de pagamentos. Ver logs da VPS.",
  });

  const proposta = add({
    title: "Enviar proposta para o 3º cliente piloto",
    kind: "task",
    area: "work",
    projectId: zeloa.id,
    dueDate: addDays(today, 3),
    estimateMin: 120,
    people: ["Rafael"],
  });
  const step1 = add({
    title: "Reaproveitar a proposta do piloto 2",
    parentId: proposta.id,
    area: "work",
    projectId: zeloa.id,
    estimateMin: 15,
  });
  step1.status = "done";
  step1.completedAt = daysAgoISO(today, 1);
  add({ title: "Ajustar preço e escopo", parentId: proposta.id, area: "work", projectId: zeloa.id, estimateMin: 30 });
  add({
    title: "Mandar por e-mail para o Rafael",
    parentId: proposta.id,
    area: "work",
    projectId: zeloa.id,
    estimateMin: 10,
  });

  add({
    title: "Responder Carla sobre o orçamento do site",
    kind: "task",
    area: "work",
    scheduledDate: today,
    people: ["Carla"],
    estimateMin: 15,
  });
  add({
    title: "Revisar textos da landing",
    kind: "task",
    area: "work",
    projectId: zeloa.id,
    scheduledDate: addDays(today, -2),
    estimateMin: 45,
  });
  add({
    title: "Organizar fotos do sítio para o anúncio",
    kind: "task",
    area: "work",
    projectId: sitio.id,
    estimateMin: 40,
  });
  add({
    title: "Testar uma reserva de ponta a ponta",
    kind: "task",
    area: "work",
    projectId: sitio.id,
    dueDate: addDays(today, 8),
    estimateMin: 30,
  });
  add({ title: "Onboarding por áudio no WhatsApp", kind: "idea", area: "work", projectId: zeloa.id });
  add({ title: "Copiloto com resumo diário por voz", kind: "idea", area: "work", projectId: copiloto.id });
  add({ title: "Retomar calendário editorial", kind: "task", area: "work", projectId: hub.id, status: "someday" });

  /* ---------- pessoal ---------- */
  add({ title: "Comprar shampoo", kind: "shopping", area: "personal", scheduledDate: today, estimateMin: 10 });
  const dentista = add(
    { title: "Marcar dentista", kind: "task", area: "personal", estimateMin: 10 },
    { createdDaysAgo: 18 },
  );
  dentista.updatedAt = daysAgoISO(today, 18);
  add(
    { title: "Renovar CNH", kind: "task", area: "personal", dueDate: addDays(today, -3), estimateMin: 30 },
    { createdDaysAgo: 20 },
  );
  const lampada = add(
    { title: "Trocar a lâmpada da cozinha", kind: "task", area: "personal", estimateMin: 10 },
    { createdDaysAgo: 14 },
  );
  lampada.updatedAt = daysAgoISO(today, 14);
  add({
    title: "Comprar presente da Bia",
    kind: "shopping",
    area: "personal",
    dueDate: addDays(today, 4),
    estimateMin: 30,
  });
  add({ title: "Planejar viagem de fim de ano", kind: "task", area: "personal", priority: "low" });
  add({
    title: "Revisão semanal (15 min)",
    kind: "routine",
    area: "personal",
    scheduledDate: addDays(today, (7 - new Date(`${today}T12:00:00`).getDay()) % 7 || 7),
    estimateMin: 15,
    recurrence: { freq: "weekly", seriesId: newId("ser") },
  });

  /* ---------- financeiro ---------- */
  add({
    title: "Ligar para a contadora sobre o imposto",
    kind: "task",
    area: "finance",
    scheduledDate: addDays(today, 1),
    people: ["Contadora"],
    estimateMin: 15,
  });
  add({
    title: "Pagar fatura do cartão",
    kind: "bill",
    area: "finance",
    dueDate: addDays(today, 1),
    money: money(184237, "out", "Cartão"),
    recurrence: { freq: "monthly", seriesId: newId("ser") },
  });
  add({
    title: "Hospedagem da VPS",
    kind: "bill",
    area: "finance",
    dueDate: addDays(today, 2),
    projectId: zeloa.id,
    money: money(8990, "out", "Ferramentas"),
    recurrence: { freq: "monthly", seriesId: newId("ser") },
  });
  add({
    title: "Internet de casa",
    kind: "bill",
    area: "finance",
    dueDate: addDays(today, -1),
    money: money(11990, "out", "Casa"),
    recurrence: { freq: "monthly", seriesId: newId("ser") },
  });
  add({
    title: "Conta de luz",
    kind: "bill",
    area: "finance",
    dueDate: addDays(today, 6),
    money: money(21045, "out", "Casa"),
  });
  add({
    title: "DAS (MEI)",
    kind: "bill",
    area: "finance",
    dueDate: dayOfMonth(today, 20, true),
    money: money(7660, "out", "Impostos"),
    recurrence: { freq: "monthly", seriesId: newId("ser") },
  });
  add({
    title: "Assinatura da ferramenta de IA",
    kind: "bill",
    area: "finance",
    dueDate: addDays(today, 16),
    money: money(11000, "out", "Ferramentas"),
    recurrence: { freq: "monthly", seriesId: newId("ser") },
  });

  const aluguelSeries = newId("ser");
  const aluguelPago = add({
    title: "Aluguel",
    kind: "bill",
    area: "finance",
    dueDate: dayOfMonth(today, 5),
    money: money(230000, "out", "Casa", true),
    recurrence: { freq: "monthly", seriesId: aluguelSeries },
  });
  aluguelPago.status = "done";
  aluguelPago.completedAt = daysAgoISO(today, 3);
  add({
    title: "Aluguel",
    kind: "bill",
    area: "finance",
    dueDate: addDays(monthStart(addDays(monthEnd(today), 1)), 4),
    money: money(230000, "out", "Casa"),
    recurrence: { freq: "monthly", seriesId: aluguelSeries },
  });

  const mercado = add({
    title: "Mercado do mês",
    kind: "expense",
    area: "finance",
    dueDate: addDays(today, -2),
    money: money(31240, "out", "Mercado", true),
  });
  mercado.status = "done";
  mercado.completedAt = daysAgoISO(today, 2);

  add({
    title: "Pagamento do piloto 2 (Zeloa)",
    kind: "income",
    area: "finance",
    projectId: zeloa.id,
    dueDate: addDays(today, 4),
    money: money(350000, "in", "Trabalho"),
  });
  const reserva = add({
    title: "Reserva do sítio — feriado",
    kind: "income",
    area: "finance",
    projectId: sitio.id,
    dueDate: addDays(today, -3),
    money: money(128000, "in", "Trabalho", true),
  });
  reserva.status = "done";
  reserva.completedAt = daysAgoISO(today, 3);
  add({
    title: "Freela de conteúdo",
    kind: "income",
    area: "finance",
    dueDate: addDays(today, 15),
    money: money(200000, "in", "Trabalho"),
  });

  /* ---------- metas ---------- */
  add({
    title: "Fechar o 3º cliente piloto do Zeloa",
    kind: "goal",
    area: "work",
    projectId: zeloa.id,
    dueDate: monthEnd(today),
  });
  add({ title: "Gastar menos de R$ 600 com delivery", kind: "goal", area: "finance", dueDate: monthEnd(today) });

  /* ---------- agenda ---------- */
  const ev = (title: string, day: number, start: string, end: string | null, extra: Partial<ItemInput> = {}) =>
    add({
      title,
      kind: "event",
      area: "work",
      scheduledDate: addDays(today, day),
      startTime: start,
      endTime: end,
      ...extra,
    });
  ev("Daily do Zeloa", 0, "10:00", "10:30", { projectId: zeloa.id });
  ev("Call com cliente piloto", 0, "15:00", "16:00", { projectId: zeloa.id, people: ["Rafael"] });
  ev("Academia", 1, "07:00", "08:00", { area: "personal" });
  ev("Reunião com a contadora", 2, "14:00", "15:00", { area: "finance", people: ["Contadora"] });
  ev("Call com parceiro do Copiloto", 2, "14:30", "15:00", { projectId: copiloto.id });
  ev("Aniversário da Bia", 4, "19:30", null, { area: "personal", people: ["Bia"] });
  ev("Check-in de hóspedes no sítio", 9, "14:00", "15:00", { projectId: sitio.id });
  ev("Consulta de rotina", 13, "09:00", "10:00", { area: "personal" });

  /* ---------- notas ---------- */
  const notes: Note[] = [
    {
      id: newId("note"),
      projectId: zeloa.id,
      body: "Piloto 2 pediu relatório semanal por e-mail. Avaliar se vira feature.",
      createdAt: daysAgoISO(today, 4),
    },
    {
      id: newId("note"),
      projectId: zeloa.id,
      body: "Webhook falha quando o gateway demora > 10s. Talvez aumentar timeout.",
      createdAt: daysAgoISO(today, 1),
    },
    {
      id: newId("note"),
      projectId: sitio.id,
      body: "Senha do Beds24 está no gerenciador de senhas (não colocar aqui).",
      createdAt: daysAgoISO(today, 6),
    },
    {
      id: newId("note"),
      projectId: copiloto.id,
      body: "Opções de preço: R$ 29/mês individual ou R$ 99 por equipe.",
      createdAt: daysAgoISO(today, 5),
    },
  ];

  /* ---------- inbox ---------- */
  const ctx = { today, projects };
  const captureTexts = [
    { text: "lembrar de pagar o seguro do carro sexta e mandar o contrato pro Rafael", hoursAgo: 1 },
    { text: "olhar aquela cobrança estranha no extrato", hoursAgo: 5 },
    { text: "ideia para o Copiloto: modo foco que esconde tudo menos a próxima ação", hoursAgo: 20 },
    { text: "comprar ração do Tico sábado", hoursAgo: 26 },
    { text: "preciso resolver imposto esse mês", hoursAgo: 50 },
  ];
  const captures: Capture[] = captureTexts.map(({ text, hoursAgo }) => ({
    id: newId("cap"),
    text,
    createdAt: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
    status: "inbox",
    interpretation: interpretText(text, ctx),
    itemIds: [],
  }));

  let data: AppData = { version: DATA_VERSION, items, captures, projects, notes, decisions: [], activity: [] };

  /* ---------- decisões ---------- */
  data = addDecision(data, {
    kind: "approve",
    title: "Aprovar orçamento do fotógrafo do sítio · R$ 650",
    context: "Ele pode fotografar sábado. Aprovar cria a conta a pagar para daqui 7 dias.",
    projectId: sitio.id,
    actions: [
      {
        tool: "create_item",
        input: {
          item: {
            title: "Pagar fotógrafo do sítio",
            kind: "bill",
            area: "finance",
            projectId: sitio.id,
            dueDate: addDays(today, 7),
            money: { amountCents: 65000, direction: "out", category: "Trabalho", settled: false },
          },
        },
      },
    ],
    createdBy: "user",
    dedupeKey: "demo:fotografo",
  });
  data = addDecision(data, {
    kind: "reply",
    title: "Carla quer saber se fecha o site por R$ 4.800",
    context: "Você ainda não respondeu. Aprovar marca para responder hoje como prioridade.",
    itemId: items.find((i) => i.title.startsWith("Responder Carla"))!.id,
    actions: [
      {
        tool: "update_item",
        input: { itemId: items.find((i) => i.title.startsWith("Responder Carla"))!.id, patch: { focusDate: today } },
      },
    ],
    createdBy: "user",
    dedupeKey: "demo:carla",
  });

  data = logActivity(data, { actor: "system", tool: "seed", summary: "Dados de demonstração criados", status: "ok" });
  data = runAgentRules(data, today);
  return data;
}
