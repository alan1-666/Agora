import { avatarColor, initial } from "@/lib/format";
import type { Agent } from "@/lib/types";

// 频道里的 AI 成员。点选 = 选当前接手者(默认 agent);也可在消息里 @名字 临时指定。
export default function MemberChips({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 text-xs text-neutral-400">成员</span>
      {agents.map((a) => {
        const active = a.id === selectedId;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            title={`${a.name} · ${a.tools.length} 工具`}
            className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors ${
              active
                ? "border-brand/40 bg-brand-soft font-medium text-brand"
                : "border-hairline text-neutral-600 hover:bg-black/[0.03]"
            }`}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: avatarColor(a.name) }}
            >
              {initial(a.name)}
            </span>
            {a.name}
          </button>
        );
      })}
    </div>
  );
}
