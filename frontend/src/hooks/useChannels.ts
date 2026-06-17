import { useCallback, useEffect, useState } from "react";
import { createChannel, listChannels, listDms, openDm as apiOpenDm } from "@/lib/api";
import type { Channel } from "@/lib/types";

/** 频道 + DM 私信 + 当前选中。空时自动建一个默认频道。 */
export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dms, setDms] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    let chs = await listChannels();
    if (chs.length === 0) {
      await createChannel("general");
      chs = await listChannels();
    }
    const d = await listDms();
    setChannels(chs);
    setDms(d);
    setActiveId((cur) => cur ?? chs[0]?.id ?? null);
  }, []);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const create = useCallback(async (name: string) => {
    const ch = await createChannel(name);
    setChannels((c) => [...c, ch]);
    setActiveId(ch.id);
    return ch;
  }, []);

  // 打开/创建与某 agent 的私信
  const openDm = useCallback(async (agentId: string) => {
    const dm = await apiOpenDm(agentId);
    setDms((prev) => (prev.some((x) => x.id === dm.id) ? prev : [...prev, dm]));
    setActiveId(dm.id);
    return dm;
  }, []);

  const active = [...channels, ...dms].find((c) => c.id === activeId) ?? null;
  return { channels, dms, active, activeId, setActiveId, create, openDm };
}
