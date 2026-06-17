"use client";

import Composer from "@/components/chat/Composer";
import MemberChips from "@/components/chat/MemberChips";
import MessageList from "@/components/chat/MessageList";
import { useWorkspace } from "@/components/workspace-context";
import { useChat } from "@/hooks/useChat";
import { resolveMention } from "@/lib/format";

export default function ChatPage() {
  const { active, agents, agentId, setAgentId, activeAgent } = useWorkspace();
  const { items, streaming, send } = useChat(active?.id ?? null, agentId);
  const assistantName = activeAgent?.name ?? "AI";

  // 发送时:消息里 @了某 agent 就临时指定它接手,否则用当前选中的成员。
  function onSend(text: string) {
    const mentioned = resolveMention(text, agents);
    send(text, mentioned?.id);
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5">
        <span className="text-base font-semibold text-neutral-900">
          <span className="text-neutral-400"># </span>
          {active?.name ?? "…"}
        </span>
        <MemberChips agents={agents} selectedId={agentId} onSelect={setAgentId} />
      </header>

      {items.length === 0 && !streaming ? (
        <Empty members={agents.map((a) => a.name)} />
      ) : (
        <MessageList items={items} assistantName={assistantName} streaming={streaming} />
      )}

      <Composer
        disabled={streaming}
        onSend={onSend}
        placeholder={`给 #${active?.name ?? ""} 发消息，@成员 可指定接手…`}
      />
    </>
  );
}

function Empty({ members }: { members: string[] }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-neutral-400">
      <div className="mb-2 text-4xl">💬</div>
      <p className="max-w-sm text-sm">
        和 AI 同事开始协作。直接发消息，或 <b className="text-neutral-500">@{members[0] ?? "助手"}</b>{" "}
        指定某位成员接手。试试「帮我算 (13×17)+5」，或 @{members.find((m) => m.includes("协调")) ?? "协调者"} 让它派活。
      </p>
    </div>
  );
}
