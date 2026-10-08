import { z } from "zod";
import type { ToolOrigin } from "@/lib/domain/types";
import { TOOLS } from "./definitions";
import { authorize } from "./policy";

const ORIGINS: ToolOrigin[] = ["user_app", "automation", "agent", "import"];

/** Descrição serializável das ferramentas (JSON Schema incluído) para um agente/LLM. */
export function toolManifest() {
  return TOOLS.map((t) => ({
    name: t.name,
    mode: t.mode,
    /** mantido por compatibilidade com a tela “Mais” */
    kind: t.mode,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input) as Record<string, unknown>,
    sensitivity: t.sensitivity,
    enabled: t.enabled,
    risk: t.mode === "write" ? t.risk : null,
    /** por origem: executa direto, vira decisão, ou é negado */
    policy: Object.fromEntries(ORIGINS.map((o) => [o, authorize(o, undefined, t).effect])) as Record<
      ToolOrigin,
      "allow" | "confirm" | "deny"
    >,
  }));
}
