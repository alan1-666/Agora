import { useEffect, useRef } from "react";
import type { ChatItem } from "@/lib/types";
import MessageItem from "./MessageItem";
import ToolRow from "./ToolRow";

// 消息流:分组渲染 + 自动滚到底。inThread=true 时不显示"回复"入口(线程内不再开子线程)。
export default function MessageList({
  items,
  assistantName,
  streaming,
  onReply,
  inThread,
}: {
  items: ChatItem[];
  assistantName: string;
  streaming: boolean;
  onReply?: (id: string, content: string) => void;
  inThread?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => ref.current?.scrollTo(0, ref.current.scrollHeight));
  }, [items]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto py-4">
      <div className="px-5 pb-2 text-center text-xs text-neutral-400">
        — {inThread ? "线程" : "对话开始"} —
      </div>

      {items.map((it, i) => {
        if (it.kind === "tool") {
          return <ToolRow key={i} name={it.name} input={it.input} output={it.output} />;
        }
        const prev = items[i - 1];
        const grouped = prev?.kind === "message" && prev.role === it.role;
        const showReply = !inThread && onReply && it.id;
        return (
          <div key={i}>
            <MessageItem
              role={it.role}
              author={it.role === "user" ? "你" : assistantName}
              content={it.content}
              grouped={grouped}
              streaming={streaming && i === items.length - 1}
            />
            {showReply && (
              <button
                onClick={() => onReply!(it.id!, it.content)}
                className="ml-11 mt-0.5 rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              >
                {it.replyCount ? `💬 ${it.replyCount} 条回复` : "💬 回复"}
              </button>
            )}
          </div>
        );
      })}

      {streaming && (
        <div className="mt-2 flex items-center gap-2 px-5 text-xs text-neutral-400">
          <span className="inline-flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
          </span>
          {assistantName} 正在处理…
        </div>
      )}
    </div>
  );
}
