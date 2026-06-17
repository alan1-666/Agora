import { useCallback, useEffect, useState } from "react";
import { listMessages, listThread, streamChat } from "@/lib/api";
import type { ChatItem } from "@/lib/types";

/**
 * 一个会话的对话(频道主时间线,或某个线程)。threadId 非空时作用于该线程。
 * 加载历史 + 发送 + 流式接收(含工具调用),流式拼装逻辑收在这里。
 */
export function useChat(channelId: string | null, agentId: string, threadId?: string) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);

  const load = useCallback(async () => {
    if (!channelId) return;
    const ms = threadId ? await listThread(threadId) : await listMessages(channelId);
    setItems(
      ms.map((m) => ({ kind: "message", role: m.role, content: m.content, id: m.id, replyCount: m.reply_count })),
    );
  }, [channelId, threadId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const send = useCallback(
    async (text: string, agentOverride?: string) => {
      const content = text.trim();
      if (!content || streaming || !channelId) return;

      const buf: ChatItem[] = [...items, { kind: "message", role: "user", content }];
      setItems([...buf]);
      setStreaming(true);

      const targetAgent = agentOverride || agentId;
      let openAssistant = -1;
      try {
        for await (const ev of streamChat(channelId, content, targetAgent || undefined, threadId)) {
          if (ev.delta) {
            if (openAssistant === -1) {
              buf.push({ kind: "message", role: "assistant", content: "" });
              openAssistant = buf.length - 1;
            }
            const cur = buf[openAssistant] as { kind: "message"; role: "assistant"; content: string };
            buf[openAssistant] = { ...cur, content: cur.content + ev.delta };
          } else if (ev.tool_call) {
            openAssistant = -1;
            buf.push({ kind: "tool", name: ev.tool_call.name, input: JSON.stringify(ev.tool_call.input) });
          } else if (ev.tool_result) {
            for (let i = buf.length - 1; i >= 0; i--) {
              const it = buf[i];
              if (it.kind === "tool" && it.output === undefined) {
                buf[i] = { ...it, output: ev.tool_result.output };
                break;
              }
            }
          } else if (ev.error) {
            buf.push({ kind: "message", role: "assistant", content: `⚠️ ${ev.error}` });
            openAssistant = -1;
          }
          setItems([...buf]);
        }
      } catch (e) {
        buf.push({ kind: "message", role: "assistant", content: `⚠️ 请求失败: ${String(e)}` });
        setItems([...buf]);
      } finally {
        setStreaming(false);
      }
    },
    [channelId, agentId, threadId, items, streaming],
  );

  return { items, streaming, send, reload: load };
}
