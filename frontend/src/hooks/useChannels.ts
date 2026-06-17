import { useCallback, useEffect, useState } from "react";
import { createChannel, listChannels } from "@/lib/api";
import type { Channel } from "@/lib/types";

/** 频道列表 + 当前选中。空时自动建一个默认频道。 */
export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    let chs = await listChannels();
    if (chs.length === 0) {
      await createChannel("general");
      chs = await listChannels();
    }
    setChannels(chs);
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

  const active = channels.find((c) => c.id === activeId) ?? null;
  return { channels, active, activeId, setActiveId, create };
}
