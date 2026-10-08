"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { searchAll } from "@/lib/domain/search";
import { KIND_LABEL } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { useUI } from "@/lib/store/ui";
import { IconSearch } from "@/components/ui/icons";
import { Group } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";

const STATUS_LABEL = { open: "", done: "feito", someday: "algum dia", archived: "arquivado" } as const;

export function SearchSheet() {
  const open = useUI((s) => s.searchOpen);
  const close = useUI((s) => s.closeSearch);
  return (
    <Sheet open={open} onClose={close} title="Buscar">
      {open && <SearchBody onClose={close} />}
    </Sheet>
  );
}

function SearchBody({ onClose }: { onClose: () => void }) {
  const { data } = useApp();
  const openItem = useUI((s) => s.openItem);
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const r = searchAll(data, deferred);
  const projectName = (id?: string | null) => data.projects.find((p) => p.id === id)?.name;

  return (
    <div>
      <label className="mb-5 flex items-center gap-3 rounded-2xl bg-surface px-4 shadow-soft">
        <IconSearch size={18} className="text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tarefa, nota, pessoa, projeto…"
          aria-label="Buscar"
          className="h-12 flex-1 bg-transparent text-[17px] placeholder:text-faint focus:outline-none"
          enterKeyHint="search"
        />
      </label>

      {deferred.trim().length > 1 && r.total === 0 && (
        <p className="px-1 text-[14px] text-muted">Nada encontrado. Tente outra palavra.</p>
      )}

      {r.items.length > 0 && (
        <ResultGroup title="Itens">
          {r.items.map((i) => (
            <button
              key={i.id}
              className="block w-full px-4 py-3 text-left hover:bg-surface-2"
              onClick={() => {
                onClose();
                openItem(i.id);
              }}
            >
              <p className="text-[15px] text-ink">{i.title}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {[KIND_LABEL[i.kind], projectName(i.projectId), STATUS_LABEL[i.status]].filter(Boolean).join(" · ")}
              </p>
            </button>
          ))}
        </ResultGroup>
      )}

      {r.projects.length > 0 && (
        <ResultGroup title="Projetos">
          {r.projects.map((p) => (
            <Link
              key={p.id}
              href={`/projetos/${p.id}`}
              onClick={onClose}
              className="block px-4 py-3 hover:bg-surface-2"
            >
              <p className="text-[15px] text-ink">{p.name}</p>
              {p.currentState && <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">{p.currentState}</p>}
            </Link>
          ))}
        </ResultGroup>
      )}

      {r.notes.length > 0 && (
        <ResultGroup title="Notas">
          {r.notes.map((n) => (
            <Link
              key={n.id}
              href={n.projectId ? `/projetos/${n.projectId}` : "/projetos"}
              onClick={onClose}
              className="block px-4 py-3 hover:bg-surface-2"
            >
              <p className="line-clamp-2 text-[14px] text-ink-2">{n.body}</p>
              {projectName(n.projectId) && <p className="mt-0.5 text-[12px] text-muted">{projectName(n.projectId)}</p>}
            </Link>
          ))}
        </ResultGroup>
      )}

      {r.captures.length > 0 && (
        <ResultGroup title="Na Inbox">
          {r.captures.map((c) => (
            <Link
              key={c.id}
              href="/inbox"
              onClick={onClose}
              className="block px-4 py-3 text-[14px] text-ink-2 hover:bg-surface-2"
            >
              “{c.text}”
            </Link>
          ))}
        </ResultGroup>
      )}
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <Group>{children}</Group>
    </section>
  );
}
