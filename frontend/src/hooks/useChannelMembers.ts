import { useCallback, useEffect, useState } from "react";
import { addMember, listMembers, removeMember } from "@/lib/api";
import type { Agent } from "@/lib/types";

/** 某频道的 AI 成员 + 增删。DM(传 null/dm)不加载。 */
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

  return { members, add, remove };
}
