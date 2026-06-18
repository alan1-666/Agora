import { useState } from "react";
import { avatarColor, initial } from "@/lib/format";
import type { Agent } from "@/lib/types";

// 频道成员条:成员 chips(点选当前接手者,协调者带👑)+ 管理弹层(加入/移出、设/取协调者)。
export default function MembersBar({
  members,
  agents,
  selectedId,
  coordinatorId,
  onSelect,
  onAdd,
  onRemove,
  onToggleCoordinator,
}: {
  members: Agent[];
  agents: Agent[];
  selectedId: string;
  coordinatorId: string | null;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleCoordinator: (id: string) => void;
}) {
  const [manage, setManage] = useState(false);
  const inChannel = (id: string) => members.some((m) => m.id === id);

  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-0.5 text-xs text-neutral-400">成员</span>
      {members.map((a) => {
        const active = a.id === selectedId;
        const isCoord = a.id === coordinatorId;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            title={isCoord ? `${a.name}（协调者）` : a.name}
            className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors ${
              active
                ? "border-brand/40 bg-brand-soft font-medium text-brand"
                : "border-hairline text-neutral-600 hover:bg-black/[0.03]"
            }`}
          >
            <Dot name={a.name} />
            {isCoord && <span className="-ml-0.5 text-[11px]">👑</span>}
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
            <div className="animate-pop absolute right-0 top-9 z-40 w-72 rounded-2xl border border-hairline bg-white p-1.5 shadow-[0_16px_44px_-12px_rgba(19,23,34,0.28)]">
              <div className="px-2 py-1.5 text-xs text-neutral-400">
                点选加入 / 移出本频道；👑 设为协调者（主 agent，自动拆活、汇总）
              </div>
              {agents.map((a) => {
                const on = inChannel(a.id);
                const isCoord = a.id === coordinatorId;
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.04]"
                  >
                    <button
                      onClick={() => (on ? onRemove(a.id) : onAdd(a.id))}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Dot name={a.name} />
                      <span className="flex-1 truncate text-sm text-neutral-700">{a.name}</span>
                    </button>
                    {on && (
                      <button
                        onClick={() => onToggleCoordinator(a.id)}
                        title={isCoord ? "取消协调者" : "设为协调者"}
                        className={`grid h-6 w-6 place-items-center rounded-md text-xs transition-colors ${
                          isCoord
                            ? "bg-brand-soft"
                            : "opacity-35 grayscale hover:bg-black/[0.04] hover:opacity-100 hover:grayscale-0"
                        }`}
                      >
                        👑
                      </button>
                    )}
                    {on && <span className="w-3 text-brand">✓</span>}
                    {!on && <span className="w-3" />}
                  </div>
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
