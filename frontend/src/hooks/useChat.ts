import { useCallback, useEffect, useState } from "react";
import { dispatch, listMessages, listThread, subscribeChannel } from "@/lib/api";
import type { ChatItem, ChatMessage } from "@/lib/types";

/**
 * 一个会话(频道主时间线,或某线程)的对话。异步模型:
 * - send → 派活(立即返回),agent 在后台干。
 * - 订阅频道实时流:用户消息/最终回复(持久化)即时出现;过程中的活动(delta/工具)实时显示。
 * - 离开再回来,后台已把结果落库,载历史即可见。
 * threadId 非空时本会话作用于该线程,按 parent_id 过滤。
 */
export function useChat(channelId: string | null, agentId: string, threadId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]); // 持久化消息(按作用域)
  const [live, setLive] = useState<ChatItem[]>([]); // 当前这轮的实时活动(delta/工具)
  const [working, setWorking] = useState(false);

  const inScope = useCallback(
    (m: ChatMessage) =>
      threadId ? m.parent_id === threadId || m.id === threadId : m.parent_id == null,
    [threadId],
  );

  const load = useCallback(async () => {
    if (!channelId) return;
    const ms = threadId ? await listThread(threadId) : await listMessages(channelId);
    setMessages(ms);
  }, [channelId, threadId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  // 订阅频道实时流
  useEffect(() => {
    if (!channelId) return;
    const unsub = subscribeChannel(channelId, (ev) => {
      if (ev.type === "message") {
        const m = ev.message;
        if (inScope(m)) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.role === "assistant") {
            setLive([]); // 最终回复落定,清掉实时活动
            setWorking(false);
          }
        } else if (!threadId && m.parent_id) {
          // 主视图:线程回复 → 给根消息回复数 +1
          setMessages((prev) =>
            prev.map((x) => (x.id === m.parent_id ? { ...x, reply_count: (x.reply_count ?? 0) + 1 } : x)),
          );
        }
        return;
      }
      // activity
      if (ev.state === "working") {
        setWorking(true);
        setLive([]);
      } else if (ev.state === "done") {
        // 只停"处理中";不清 live —— 成功时 live 已被最终消息清掉,失败时错误需留着可见
        setWorking(false);
      } else if (ev.kind === "delta") {
        setLive((prev) => appendDelta(prev, ev.text ?? ""));
      } else if (ev.kind === "tool_call") {
        setLive((prev) => [...prev, { kind: "tool", name: ev.name ?? "", input: JSON.stringify(ev.input) }]);
      } else if (ev.kind === "tool_result") {
        setLive((prev) => fillToolResult(prev, ev.output ?? ""));
      } else if (ev.kind === "error") {
        setLive((prev) => appendDelta(prev, `⚠️ ${ev.text ?? ""}`));
      }
    });
    return unsub;
  }, [channelId, threadId, inScope]);

  const send = useCallback(
    (text: string, agentOverride?: string) => {
      const content = text.trim();
      if (!content || !channelId) return;
      dispatch(channelId, content, agentOverride || agentId || undefined, threadId).catch(console.error);
    },
    [channelId, agentId, threadId],
  );

  const items: ChatItem[] = [
    ...messages.map(
      (m) =>
        ({
          kind: "message",
          role: m.role,
          content: m.content,
          id: m.id,
          replyCount: m.reply_count,
          author: m.author,
          relayFrom: m.relay_from,
        }) as ChatItem,
    ),
    ...live,
  ];

  return { items, streaming: working, send, reload: load };
}

function appendDelta(prev: ChatItem[], text: string): ChatItem[] {
  const copy = [...prev];
  const last = copy[copy.length - 1];
  if (last && last.kind === "message" && last.role === "assistant") {
    copy[copy.length - 1] = { ...last, content: last.content + text };
  } else {
    copy.push({ kind: "message", role: "assistant", content: text });
  }
  return copy;
}

function fillToolResult(prev: ChatItem[], output: string): ChatItem[] {
  const copy = [...prev];
  for (let i = copy.length - 1; i >= 0; i--) {
    const it = copy[i];
    if (it.kind === "tool" && it.output === undefined) {
      copy[i] = { ...it, output };
      break;
    }
  }
  return copy;
}
