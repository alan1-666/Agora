"use client";

import AgentPicker from "@/components/chat/AgentPicker";
import Composer from "@/components/chat/Composer";
import MessageList from "@/components/chat/MessageList";
import { useWorkspace } from "@/components/workspace-context";
import { useChat } from "@/hooks/useChat";

export default function ChatPage() {
  const { active, agents, agentId, setAgentId, activeAgent } = useWorkspace();
  const { items, streaming, send } = useChat(active?.id ?? null, agentId);
  const assistantName = activeAgent?.name ?? "AI";

  return (
    <>
      {/* 频道头 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-neutral-900">
            <span className="text-neutral-400"># </span>
            {active?.name ?? "…"}
          </span>
        </div>
        <AgentPicker agents={agents} value={agentId} onChange={setAgentId} />
      </header>

      {items.length === 0 && !streaming ? (
        <Empty />
      ) : (
        <MessageList items={items} assistantName={assistantName} streaming={streaming} />
      )}

      <Composer disabled={streaming} onSend={send} placeholder={`给 #${active?.name ?? ""} 发消息…`} />
    </>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center text-neutral-400">
      <div className="mb-2 text-4xl">💬</div>
      <p className="text-sm">
        和 AI 同事开始协作吧。试试「帮我算 (13×17)+5」，或选「协调者」让它派活。
      </p>
    </div>
  );
}
