import { useCallback, useEffect, useState } from "react";
import { listMessages, streamChat } from "@/lib/api";
import type { ChatItem } from "@/lib/types";

/**
 * 单个频道的对话:加载历史 + 发送 + 流式接收(含工具调用)。
 * 把流式拼装逻辑收在这里,页面只管渲染 items。
 */
export function useChat(channelId: string | null, agentId: string) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    listMessages(channelId)
      .then((ms) => setItems(ms.map((m) => ({ kind: "message", role: m.role, content: m.content }))))
      .catch(console.error);
  }, [channelId]);

  const send = useCallback(
    async (text: string, agentOverride?: string) => {
      const content = text.trim();
      if (!content || streaming || !channelId) return;

      const buf: ChatItem[] = [...items, { kind: "message", role: "user", content }];
      setItems([...buf]);
      setStreaming(true);

      const targetAgent = agentOverride || agentId;
      let openAssistant = -1; // 当前正在追加的助手消息下标;-1 表示需新建
      try {
        for await (const ev of streamChat(channelId, content, targetAgent || undefined)) {
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
    [channelId, agentId, items, streaming],
  );

  return { items, streaming, send };
}
