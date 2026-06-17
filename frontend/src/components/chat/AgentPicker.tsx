import type { Agent } from "@/lib/types";

// 当前频道使用的 agent 选择(协调者/助手…)。
export default function AgentPicker({
  agents,
  value,
  onChange,
}: {
  agents: Agent[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-neutral-200 bg-white py-1.5 pl-3 pr-8 text-sm text-neutral-700 outline-none hover:border-neutral-300"
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            🤖 {a.name}（{a.tools.length} 工具）
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
        ▾
      </span>
    </div>
  );
}
