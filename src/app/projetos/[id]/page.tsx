"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { addNote, updateProject } from "@/lib/domain/operations";
import { summarizeProject } from "@/lib/domain/selectors";
import { AREA_LABEL, type Area, type Project, type ProjectStatus } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { useStore } from "@/lib/store/store";
import { ItemRow } from "@/components/items/ItemRow";
import { Ready } from "@/components/shell/AppShell";
import { IconChevronLeft } from "@/components/ui/icons";
import {
  Button,
  Collapsible,
  EmptyState,
  Field,
  Group,
  inputClass,
  PageHeader,
  Section,
  Segmented,
} from "@/components/ui/primitives";

export default function ProjectPage() {
  return (
    <Ready>
      <Suspense>
        <ProjectLoader />
      </Suspense>
    </Ready>
  );
}

function ProjectLoader() {
  const { id } = useParams<{ id: string }>();
  const { data } = useApp();
  const project = data.projects.find((p) => p.id === id);
  if (!project) {
    return (
      <div className="pt-16">
        <EmptyState title="Projeto não encontrado.">
          <Link href="/projetos" className="text-accent-text">
            Ver projetos
          </Link>
        </EmptyState>
      </div>
    );
  }
  return <ProjectDetail key={project.id} project={project} />;
}

function ProjectDetail({ project }: { project: Project }) {
  const { data, today } = useApp();
  const apply = useStore((s) => s.apply);
  const addItem = useStore((s) => s.addItem);
  const s = summarizeProject(data, project, today);
  const [state, setState] = useState(project.currentState ?? "");
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);

  const notes = data.notes
    .filter((n) => n.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ideas = s.open.filter((i) => i.kind === "idea");
  const isTask = (i: (typeof s.open)[number]) => !["idea", "event", "goal"].includes(i.kind) && !i.money;
  const pending = s.open.filter((i) => isTask(i) && i.id !== s.nextAction?.id && i.id !== s.nextAction?.parentId);
  const related = s.open.filter((i) => i.kind === "event" || i.kind === "goal" || !!i.money);
  const nextParent = s.nextAction?.parentId ? data.items.find((i) => i.id === s.nextAction!.parentId) : undefined;

  const save = (patch: Partial<Project>, msg?: string) => apply((d) => updateProject(d, project.id, patch), msg);

  return (
    <>
      <Link
        href="/projetos"
        className="-ml-2 inline-flex h-10 items-center gap-1 pr-3 text-[14px] text-muted hover:text-ink lg:mt-6"
      >
        <IconChevronLeft size={18} /> Projetos
      </Link>
      <PageHeader title={project.name}>
        <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
          {editing ? "Fechar" : "Editar"}
        </Button>
      </PageHeader>

      {editing && <ProjectEditor project={project} onDone={() => setEditing(false)} />}

      <Segmented<ProjectStatus>
        className="mb-6"
        value={project.status}
        onChange={(status) => save({ status }, status === "done" ? "Projeto concluído. 🎉" : undefined)}
        options={[
          { value: "active", label: "Ativo" },
          { value: "paused", label: "Pausado" },
          { value: "done", label: "Concluído" },
        ]}
      />

      <Section title="Onde estou">
        <textarea
          className="field-sizing-content min-h-20 w-full resize-none rounded-2xl bg-surface px-4 py-3 text-[16px] leading-relaxed text-ink shadow-soft placeholder:text-faint focus:outline-none"
          placeholder="Uma ou duas frases: o estado atual, para retomar sem esforço."
          value={state}
          onChange={(e) => setState(e.target.value)}
          onBlur={() => state !== (project.currentState ?? "") && save({ currentState: state })}
        />
      </Section>

      <Section title="Próxima ação">
        {s.nextAction ? (
          <div className="overflow-hidden rounded-[28px] bg-surface shadow-soft ring-1 ring-black/[0.03]">
            <ItemRow item={s.nextAction} parent={nextParent} today={today} showProject={false} emphasis />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!next.trim()) return;
              addItem({ title: next.trim(), area: project.area, projectId: project.id, kind: "task" });
              setNext("");
            }}
          >
            <input
              className={inputClass}
              placeholder="Qual o próximo passo físico? (ex.: abrir o arquivo X)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </form>
        )}
      </Section>

      <Section title="Pendências">
        {pending.length ? (
          <Group flat>
            {pending.map((i) => (
              <ItemRow key={i.id} item={i} today={today} showProject={false} />
            ))}
          </Group>
        ) : (
          <p className="px-1 text-[14px] text-muted">Nada além da próxima ação.</p>
        )}
        {s.nextAction && (
          <form
            className="mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!next.trim()) return;
              addItem({ title: next.trim(), area: project.area, projectId: project.id, kind: "task" });
              setNext("");
            }}
          >
            <input
              className={inputClass}
              placeholder="+ Adicionar pendência"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </form>
        )}
      </Section>

      <Section title="Prazo">
        <Field label="Se houver">
          <input
            type="date"
            className={inputClass}
            value={project.deadline ?? ""}
            onChange={(e) => save({ deadline: e.target.value || null })}
          />
        </Field>
      </Section>

      <Section title="Notas e contexto">
        <form
          className="mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            apply((d) => addNote(d, { body: note.trim(), projectId: project.id }), "Nota salva.");
            setNote("");
          }}
        >
          <input
            className={inputClass}
            placeholder="Anotar algo (decisões, links, onde parei)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </form>
        {notes.length > 0 && (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-[24px] bg-surface px-5 py-4 text-[15px] text-ink-2 shadow-soft ring-1 ring-black/[0.03]">
                {n.body}
                <span className="mt-1 block text-[13px] text-muted">
                  {new Date(n.createdAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {related.length > 0 && (
        <Collapsible title="Agenda, metas e dinheiro" count={related.length}>
          <Group flat>
            {related.map((i) => (
              <ItemRow key={i.id} item={i} today={today} showProject={false} />
            ))}
          </Group>
        </Collapsible>
      )}

      {ideas.length > 0 && (
        <Collapsible title="Ideias" count={ideas.length}>
          <Group flat>
            {ideas.map((i) => (
              <ItemRow key={i.id} item={i} today={today} showProject={false} />
            ))}
          </Group>
        </Collapsible>
      )}

      {s.done.length > 0 && (
        <Collapsible title="Feitos" count={s.done.length}>
          <Group flat>
            {s.done.slice(0, 15).map((i) => (
              <ItemRow key={i.id} item={i} today={today} showProject={false} />
            ))}
          </Group>
        </Collapsible>
      )}
    </>
  );
}

function ProjectEditor({ project, onDone }: { project: Project; onDone: () => void }) {
  const apply = useStore((s) => s.apply);
  const [name, setName] = useState(project.name);
  const [area, setArea] = useState<Area>(project.area);
  const [aliases, setAliases] = useState((project.aliases ?? []).join(", "));

  return (
    <form
      className="mb-7 animate-fade space-y-3.5 rounded-[28px] bg-surface p-5 shadow-soft ring-1 ring-black/[0.03]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const list = aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
        apply((d) => updateProject(d, project.id, { name: name.trim(), area, aliases: list }), "Projeto atualizado.");
        onDone();
      }}
    >
      <Field label="Nome">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Área">
        <Segmented<Area>
          value={area}
          onChange={setArea}
          options={(Object.keys(AREA_LABEL) as Area[]).map((a) => ({ value: a, label: AREA_LABEL[a] }))}
        />
      </Field>
      <Field label="Apelidos (separados por vírgula)">
        <input
          className={inputClass}
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="ex.: Beds24, sítio, pousada"
        />
      </Field>
      <p className="px-1 text-[13px] text-muted">
        Quando um apelido aparece numa captura, ela já chega ligada a este projeto.
      </p>
      <Button variant="primary" block disabled={!name.trim()}>
        Salvar
      </Button>
    </form>
  );
}
