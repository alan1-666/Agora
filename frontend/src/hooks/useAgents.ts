import { useCallback, useEffect, useState } from "react";
import { listAgents } from "@/lib/api";
import type { Agent } from "@/lib/types";

/** agent 列表 + 当前选中 + 刷新。 */
export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  const refresh = useCallback(async () => {
    const a = await listAgents();
    setAgents(a);
    setActiveId((cur) => (a.some((x) => x.id === cur) ? cur : a[0]?.id || ""));
  }, []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  const active = agents.find((a) => a.id === activeId) ?? null;
  return { agents, active, activeId, setActiveId, refresh };
}
