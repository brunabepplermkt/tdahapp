"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { relativeDay } from "@/lib/domain/dates";
import { summarizeProject } from "@/lib/domain/selectors";
import { AREA_LABEL, type Area, type Project } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { useStore } from "@/lib/store/store";
import { Ready } from "@/components/shell/AppShell";
import { IconChevronRight, IconPlus } from "@/components/ui/icons";
import { AreaDot, Button, Collapsible, Group, inputClass, PageHeader, Segmented } from "@/components/ui/primitives";

export default function ProjectsPage() {
  return (
    <Ready>
      <Projects />
    </Ready>
  );
}

function Projects() {
  const { data } = useApp();
  const addProject = useStore((s) => s.addProject);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState<Area>("work");

  const active = data.projects.filter((p) => p.status === "active");
  const others = data.projects.filter((p) => p.status !== "active");

  return (
    <>
      <PageHeader title="Projetos">
        <Button size="sm" onClick={() => setAdding((a) => !a)}>
          <IconPlus size={16} /> Novo
        </Button>
      </PageHeader>

      {adding && (
        <form
          className="mb-6 animate-fade space-y-3 rounded-[22px] bg-surface p-4 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            addProject({ name: name.trim(), area });
            setName("");
            setAdding(false);
          }}
        >
          <input
            autoFocus
            className={inputClass}
            placeholder="Nome do projeto"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Segmented<Area>
            value={area}
            onChange={setArea}
            options={(Object.keys(AREA_LABEL) as Area[]).map((a) => ({ value: a, label: AREA_LABEL[a] }))}
          />
          <Button variant="primary" block disabled={!name.trim()}>
            Criar projeto
          </Button>
        </form>
      )}

      <Group className="mb-8">
        {active.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
        {active.length === 0 && <p className="px-4 py-5 text-[14px] text-muted">Nenhum projeto ativo.</p>}
      </Group>

      {others.length > 0 && (
        <Collapsible title="Pausados e concluídos" count={others.length}>
          <Group>
            {others.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </Group>
        </Collapsible>
      )}
    </>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const { data, today } = useApp();
  const s = summarizeProject(data, project, today);
  return (
    <Link href={`/projetos/${project.id}`} className="flex items-center gap-3 px-4 py-4 transition hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <AreaDot area={project.area} />
          <p className={clsx("text-[16px] font-semibold", project.status !== "active" ? "text-muted" : "text-ink")}>
            {project.name}
          </p>
          {project.status === "paused" && <span className="text-[12px] text-muted">pausado</span>}
          {project.deadline && project.status === "active" && (
            <span className="ml-auto text-[12px] text-muted">prazo {relativeDay(project.deadline, today)}</span>
          )}
        </div>
        {project.currentState && <p className="mt-1 line-clamp-2 text-[14px] text-ink-2">{project.currentState}</p>}
        {project.status === "active" && (
          <p className="mt-1.5 text-[13px] text-muted">
            {s.nextAction ? (
              <>
                Próximo: <span className="text-ink-2">{s.nextAction.title}</span>
              </>
            ) : (
              <span className="text-warn">Sem próxima ação</span>
            )}
            {s.open.length > 1 && <> · {s.open.length} abertos</>}
          </p>
        )}
      </div>
      <IconChevronRight size={18} className="shrink-0 text-faint" />
    </Link>
  );
}
