"use client";

import { updateItem } from "@/lib/domain/operations";
import { useApp } from "@/lib/hooks/useApp";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { Ready } from "@/components/shell/AppShell";
import { Button, EmptyState, Group, PageHeader } from "@/components/ui/primitives";

export default function SomedayPage() {
  return (
    <Ready>
      <Someday />
    </Ready>
  );
}

function Someday() {
  const { data } = useApp();
  const apply = useStore((s) => s.apply);
  const openItem = useUI((s) => s.openItem);
  const items = data.items.filter((i) => i.status === "someday");
  const ideas = data.items.filter((i) => i.kind === "idea" && i.status === "open");

  return (
    <>
      <PageHeader eyebrow="Fora do radar, sem culpa" title="Algum dia" />
      {items.length === 0 && ideas.length === 0 ? (
        <EmptyState title="Nada guardado aqui." />
      ) : (
        <>
          {items.length > 0 && (
            <Group className="mb-8">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <button className="flex-1 text-left text-[15px] text-ink" onClick={() => openItem(i.id)}>
                    {i.title}
                  </button>
                  <Button
                    size="sm"
                    onClick={() => apply((d) => updateItem(d, i.id, { status: "open" }), "De volta à lista.")}
                  >
                    Trazer de volta
                  </Button>
                </div>
              ))}
            </Group>
          )}
          {ideas.length > 0 && (
            <>
              <h2 className="t-label mb-2 px-1">Ideias</h2>
              <Group>
                {ideas.map((i) => (
                  <button
                    key={i.id}
                    className="block w-full px-4 py-3 text-left text-[15px] text-ink"
                    onClick={() => openItem(i.id)}
                  >
                    {i.title}
                  </button>
                ))}
              </Group>
            </>
          )}
        </>
      )}
    </>
  );
}
