"use client";

import { useState } from "react";
import Composer from "@/components/chat/Composer";
import MemberChips from "@/components/chat/MemberChips";
import MessageList from "@/components/chat/MessageList";
import ThreadPanel from "@/components/chat/ThreadPanel";
import { useWorkspace } from "@/components/workspace-context";
import { useChat } from "@/hooks/useChat";
import { resolveMention } from "@/lib/format";

export default function ChatPage() {
  const { active, agents, agentId, setAgentId, activeAgent } = useWorkspace();
  const isDm = active?.kind === "dm";
  // DM 锁定为私信对象;普通频道用当前选中成员
  const effectiveAgentId = isDm ? active?.agent_id ?? "" : agentId;
  const { items, streaming, send, reload } = useChat(active?.id ?? null, effectiveAgentId);
  const assistantName = isDm ? active?.name ?? "AI" : activeAgent?.name ?? "AI";
  const [thread, setThread] = useState<{ id: string; preview: string } | null>(null);

  function onSend(text: string) {
    if (isDm) {
      send(text); // DM 固定对象,不解析 @
      return;
    }
    const mentioned = resolveMention(text, agents);
    send(text, mentioned?.id);
  }
  function closeThread() {
    setThread(null);
    reload(); // 回到主时间线时刷新回复数
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* 主时间线 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-white px-5">
          <span className="text-base font-semibold text-neutral-900">
            {isDm ? (
              <>
                <span className="text-neutral-400">@ </span>
                {active?.name ?? "…"}
                <span className="ml-2 text-xs font-normal text-neutral-400">私信</span>
              </>
            ) : (
              <>
                <span className="text-neutral-400"># </span>
                {active?.name ?? "…"}
              </>
            )}
          </span>
          {!isDm && <MemberChips agents={agents} selectedId={agentId} onSelect={setAgentId} />}
        </header>

        {items.length === 0 && !streaming ? (
          <Empty isDm={isDm} dmName={active?.name} members={agents.map((a) => a.name)} />
        ) : (
          <MessageList
            items={items}
            assistantName={assistantName}
            streaming={streaming}
            onReply={(id, content) => setThread({ id, preview: content })}
          />
        )}

        <Composer
          disabled={streaming}
          onSend={onSend}
          placeholder={
            isDm ? `给 ${active?.name ?? ""} 发私信…` : `给 #${active?.name ?? ""} 发消息，@成员 可指定接手…`
          }
        />
      </div>

      {/* 线程面板 */}
      {thread && active && (
        <ThreadPanel
          channelId={active.id}
          agentId={effectiveAgentId}
          agents={isDm ? [] : agents}
          assistantName={assistantName}
          rootId={thread.id}
          rootPreview={thread.preview}
          onClose={closeThread}
        />
      )}
    </div>
  );
}

function Empty({ isDm, dmName, members }: { isDm: boolean; dmName?: string; members: string[] }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-neutral-400">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-2xl">💬</div>
      {isDm ? (
        <p className="max-w-sm text-sm">
          和 <b className="text-neutral-600">{dmName}</b> 的私信。直接发消息开始吧。
        </p>
      ) : (
        <p className="max-w-sm text-sm">
          和 AI 同事开始协作。直接发消息，或 <b className="text-neutral-600">@{members[0] ?? "助手"}</b>{" "}
          指定某位成员接手；回复某条消息可在右侧开 <b className="text-neutral-600">线程</b> 深入。
        </p>
      )}
    </div>
  );
}
