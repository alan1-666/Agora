import { useState } from "react";
import { avatarColor, initial } from "@/lib/format";
import type { Agent } from "@/lib/types";

// 频道成员条:成员 chips(点选当前接手者)+ 管理弹层(把 agent 加入/移出本频道)。
export default function MembersBar({
  members,
  agents,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
}: {
  members: Agent[];
  agents: Agent[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [manage, setManage] = useState(false);
  const inChannel = (id: string) => members.some((m) => m.id === id);

  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-0.5 text-xs text-neutral-400">成员</span>
      {members.map((a) => {
        const active = a.id === selectedId;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            title={a.name}
            className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors ${
              active
                ? "border-brand/40 bg-brand-soft font-medium text-brand"
                : "border-hairline text-neutral-600 hover:bg-black/[0.03]"
            }`}
          >
            <Dot name={a.name} />
            {a.name}
          </button>
        );
      })}

      <div className="relative">
        <button
          onClick={() => setManage((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline text-neutral-400 transition-colors hover:border-brand/40 hover:text-brand"
          title="管理成员"
        >
          ＋
        </button>
        {manage && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setManage(false)} />
            <div className="animate-pop absolute right-0 top-9 z-40 w-60 rounded-2xl border border-hairline bg-white p-1.5 shadow-[0_16px_44px_-12px_rgba(19,23,34,0.28)]">
              <div className="px-2 py-1.5 text-xs text-neutral-400">点选以加入 / 移出本频道</div>
              {agents.map((a) => {
                const on = inChannel(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => (on ? onRemove(a.id) : onAdd(a.id))}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/[0.04]"
                  >
                    <Dot name={a.name} />
                    <span className="flex-1 text-left text-neutral-700">{a.name}</span>
                    {on && <span className="text-brand">✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Dot({ name }: { name: string }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ background: avatarColor(name) }}
    >
      {initial(name)}
    </span>
  );
}
