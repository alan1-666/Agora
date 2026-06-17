import Composer from "@/components/chat/Composer";
import MessageList from "@/components/chat/MessageList";
import { useChat } from "@/hooks/useChat";
import { resolveMention } from "@/lib/format";
import type { Agent } from "@/lib/types";

// 右侧线程面板:在某条根消息下展开子对话(根 + 回复),独立 composer。
export default function ThreadPanel({
  channelId,
  agentId,
  agents,
  assistantName,
  rootPreview,
  rootId,
  onClose,
}: {
  channelId: string;
  agentId: string;
  agents: Agent[];
  assistantName: string;
  rootPreview: string;
  rootId: string;
  onClose: () => void;
}) {
  const { items, streaming, send } = useChat(channelId, agentId, rootId);

  function onSend(text: string) {
    const mentioned = resolveMention(text, agents);
    send(text, mentioned?.id);
  }

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-neutral-200 bg-white">
      <header className="flex h-14 items-center justify-between border-b border-neutral-200 px-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900">线程</div>
          <div className="truncate text-xs text-neutral-400">{rootPreview}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100" title="关闭">
          ✕
        </button>
      </header>

      <MessageList items={items} assistantName={assistantName} streaming={streaming} inThread />

      <Composer disabled={streaming} onSend={onSend} placeholder="在线程里回复…" />
    </aside>
  );
}
