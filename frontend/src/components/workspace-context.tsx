"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAgents } from "@/hooks/useAgents";
import { useChannels } from "@/hooks/useChannels";

// 工作区级共享状态:频道 + agent。侧栏与聊天页都从这里读,避免重复加载与状态割裂。
type WorkspaceValue = ReturnType<typeof useChannels> & {
  agents: ReturnType<typeof useAgents>["agents"];
  activeAgent: ReturnType<typeof useAgents>["active"];
  agentId: string;
  setAgentId: (id: string) => void;
};

const Ctx = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const channels = useChannels();
  const { agents, active, activeId, setActiveId } = useAgents();
  const value: WorkspaceValue = {
    ...channels,
    agents,
    activeAgent: active,
    agentId: activeId,
    setAgentId: setActiveId,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return v;
}
