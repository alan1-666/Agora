"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getRuntimeStatus } from "@/lib/api";
import { avatarColor, initial } from "@/lib/format";
import { useWorkspace } from "@/components/workspace-context";

const NAV = [
  { href: "/agents", label: "AI 成员", icon: "🤖" },
  { href: "/documents", label: "资料库", icon: "📄" },
  { href: "/settings", label: "设置", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { channels, active, activeId, setActiveId, create, agents, openDm } = useWorkspace();
  const [rt, setRt] = useState<{ available: boolean; version: string } | null>(null);
  const activeDmName = active?.kind === "dm" ? active.name : null;

  useEffect(() => {
    getRuntimeStatus().then(setRt).catch(() => {});
  }, [pathname]);

  const onChat = pathname === "/chat";

  async function newChannel() {
    const name = prompt("频道名称", "新频道");
    if (name) await create(name);
  }

  const item = (selected: boolean) =>
    `flex items-center gap-2 truncate rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
      selected ? "bg-brand-soft font-medium text-brand" : "text-neutral-600 hover:bg-black/5"
    }`;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-hairline bg-rail">
      {/* 工作区标题 */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-sm font-black text-white shadow-sm">
          A
        </div>
        <div className="font-semibold text-ink">Agora</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {/* 频道 */}
        <div className="mb-1 flex items-center justify-between px-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          <span>频道</span>
          <button onClick={newChannel} className="text-neutral-400 hover:text-brand" title="新建频道">
            ＋
          </button>
        </div>
        <div className="space-y-0.5">
          {channels.map((c) => (
            <Link key={c.id} href="/chat" onClick={() => setActiveId(c.id)} className={item(onChat && c.id === activeId)}>
              <span className="text-neutral-400">#</span> {c.name}
            </Link>
          ))}
        </div>

        {/* 私信 */}
        <div className="mb-1 mt-5 px-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">私信</div>
        <div className="space-y-0.5">
          {agents.map((a) => (
            <Link
              key={a.id}
              href="/chat"
              onClick={() => openDm(a.id)}
              className={item(onChat && a.name === activeDmName)}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: avatarColor(a.name) }}
              >
                {initial(a.name)}
              </span>
              {a.name}
            </Link>
          ))}
        </div>
      </nav>

      {/* 导航 */}
      <div className="space-y-0.5 px-2 py-2">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
              pathname === n.href ? "bg-black/[0.06] font-medium text-ink" : "text-neutral-600 hover:bg-black/5"
            }`}
          >
            <span className="text-base">{n.icon}</span> {n.label}
          </Link>
        ))}
      </div>

      {/* 运行时:本机 Claude Code */}
      <Link
        href="/settings"
        className="flex items-center gap-2 border-t border-hairline px-4 py-3 text-xs text-neutral-500 hover:bg-black/5"
      >
        <span className={`h-2 w-2 rounded-full ${rt?.available ? "bg-emerald-500" : "bg-amber-500"}`} />
        {rt == null ? "…" : rt.available ? `Claude Code · ${rt.version || "已就绪"}` : "未检测到 claude CLI"}
      </Link>
    </aside>
  );
}
