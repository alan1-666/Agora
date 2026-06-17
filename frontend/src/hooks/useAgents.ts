import { useEffect, useState } from "react";
import { listAgents } from "@/lib/api";
import type { Agent } from "@/lib/types";

/** agent 列表 + 当前选中。 */
export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    listAgents()
      .then((a) => {
        setAgents(a);
        setActiveId((cur) => cur || a[0]?.id || "");
      })
      .catch(console.error);
  }, []);

  const active = agents.find((a) => a.id === activeId) ?? null;
  return { agents, active, activeId, setActiveId };
}
