import { useEffect, useRef } from "react";
import type { ChatItem } from "@/lib/types";
import MessageItem from "./MessageItem";
import ToolRow from "./ToolRow";

// 消息流:分组渲染 + 自动滚到底。工具行不参与作者分组。
export default function MessageList({
  items,
  assistantName,
  streaming,
}: {
  items: ChatItem[];
  assistantName: string;
  streaming: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => ref.current?.scrollTo(0, ref.current.scrollHeight));
  }, [items]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto py-4">
      <div className="px-5 pb-2 text-center text-xs text-neutral-400">— 对话开始 —</div>

      {items.map((it, i) => {
        if (it.kind === "tool") {
          return <ToolRow key={i} name={it.name} input={it.input} output={it.output} />;
        }
        const prev = items[i - 1];
        const grouped = prev?.kind === "message" && prev.role === it.role;
        return (
          <MessageItem
            key={i}
            role={it.role}
            author={it.role === "user" ? "你" : assistantName}
            content={it.content}
            grouped={grouped}
            streaming={streaming && i === items.length - 1}
          />
        );
      })}
    </div>
  );
}
