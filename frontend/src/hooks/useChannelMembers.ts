import { useCallback, useEffect, useState } from "react";
import { addMember, listMembers, removeMember, setCoordinator } from "@/lib/api";
import type { Agent } from "@/lib/types";

/** 某频道的 AI 成员 + 增删 + 协调者。DM(传 null/dm)不加载。 */
export function useChannelMembers(channelId: string | null, isDm: boolean) {
  const [members, setMembers] = useState<Agent[]>([]);

  const reload = useCallback(async () => {
    if (!channelId || isDm) {
      setMembers([]);
      return;
    }
    setMembers(await listMembers(channelId));
  }, [channelId, isDm]);

  useEffect(() => {
    reload().catch(console.error);
  }, [reload]);

  const add = useCallback(
    async (agentId: string) => {
      if (!channelId) return;
      await addMember(channelId, agentId);
      await reload();
    },
    [channelId, reload],
  );

  const remove = useCallback(
    async (agentId: string) => {
      if (!channelId) return;
      await removeMember(channelId, agentId);
      await reload();
    },
    [channelId, reload],
  );

  // 设/取协调者:点已是协调者的→取消,否则设为协调者。
  const toggleCoordinator = useCallback(
    async (agentId: string) => {
      if (!channelId) return;
      const cur = members.find((m) => m.role === "coordinator");
      await setCoordinator(channelId, cur?.id === agentId ? "" : agentId);
      await reload();
    },
    [channelId, members, reload],
  );

  const coordinator = members.find((m) => m.role === "coordinator") ?? null;

  return { members, coordinator, add, remove, toggleCoordinator };
}
