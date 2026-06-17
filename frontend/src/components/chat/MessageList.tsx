import { useEffect, useRef } from "react";
import { avatarColor, initial } from "@/lib/format";
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

  // 取某项的显示作者:用户=「你」,助手=该条 author(缺省回退到当前接手者名)
  const authorOf = (it: ChatItem) =>
    it.kind !== "message" ? "" : it.role === "user" ? "你" : it.author || assistantName;

  return (
    <div ref={ref} className="flex-1 overflow-y-auto py-4">
      <div className="px-5 pb-2 text-center text-xs text-neutral-400">
        — {inThread ? "线程" : "对话开始"} —
      </div>

      {items.map((it, i) => {
        if (it.kind === "tool") {
          return <ToolRow key={i} name={it.name} input={it.input} output={it.output} />;
        }
        const author = authorOf(it);
        const prev = items[i - 1];
        const isRelay = !!it.relayFrom;
        // 同一作者连续消息才分组;接力消息总是独立成段(要显示接力连接)
        const grouped =
          !isRelay && prev?.kind === "message" && prev.role === it.role && authorOf(prev) === author;
        const showReply = !inThread && onReply && it.id;
        return (
          <div key={i}>
            {isRelay && <RelayConnector from={it.relayFrom!} to={author} />}
            <MessageItem
              role={it.role}
              author={author}
              content={it.content}
              grouped={grouped}
              accent={isRelay}
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

// 接力连接器:把「A 接力给 B」显示成一条串(from → to 胶囊,接在被 @ 的消息和接力回复之间)。
function RelayConnector({ from, to }: { from: string; to: string }) {
  return (
    <div className="mt-3 pl-[3.25rem]">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
        <NameDot name={from} />
        {from}
        <span className="px-0.5 text-brand/50">→</span>
        <NameDot name={to} />
        {to}
        <span className="ml-0.5 font-normal text-brand/60">接力</span>
      </span>
    </div>
  );
}

function NameDot({ name }: { name: string }) {
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ background: avatarColor(name) }}
    >
      {initial(name)}
    </span>
  );
}
