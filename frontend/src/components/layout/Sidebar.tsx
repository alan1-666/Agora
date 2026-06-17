"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getKeyStatus } from "@/lib/api";
import { avatarColor, initial } from "@/lib/format";
import type { KeyStatus } from "@/lib/types";
import { useWorkspace } from "@/components/workspace-context";

const NAV = [
  { href: "/agents", label: "AI 成员", icon: "🤖" },
  { href: "/documents", label: "资料库", icon: "📄" },
  { href: "/settings", label: "设置", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { channels, active, activeId, setActiveId, create, agents, openDm } = useWorkspace();
  const [key, setKey] = useState<KeyStatus | null>(null);
  const activeDmName = active?.kind === "dm" ? active.name : null;

  useEffect(() => {
    getKeyStatus().then(setKey).catch(() => {});
  }, [pathname]);

  const onChat = pathname === "/chat";

  async function newChannel() {
    const name = prompt("频道名称", "新频道");
    if (name) await create(name);
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-sidebar text-neutral-300">
      {/* 工作区标题 */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-black text-brand-ink">
          A
        </div>
        <div className="font-semibold text-white">Agora</div>
      </div>

      {/* 频道 */}
      <div className="mt-1 flex items-center justify-between px-4 py-1 text-xs font-medium text-neutral-500">
        <span>频道</span>
        <button onClick={newChannel} className="rounded px-1 text-neutral-400 hover:text-brand" title="新建频道">
          ＋
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2">
        <div className="space-y-0.5">
          {channels.map((c) => {
            const selected = onChat && c.id === activeId;
            return (
              <Link
                key={c.id}
                href="/chat"
                onClick={() => setActiveId(c.id)}
                className={`block truncate rounded-md px-2 py-1.5 text-sm transition-colors ${
                  selected ? "bg-brand/15 font-medium text-brand" : "text-neutral-300 hover:bg-white/5"
                }`}
              >
                <span className="text-neutral-500">#</span> {c.name}
              </Link>
            );
          })}
        </div>

        {/* 私信:和某个 AI 成员一对一 */}
        <div className="mt-4 mb-1 px-2 text-xs font-medium text-neutral-500">私信</div>
        <div className="space-y-0.5">
          {agents.map((a) => {
            const dmActive = onChat && activeId != null && a.name === activeDmName;
            return (
              <Link
                key={a.id}
                href="/chat"
                onClick={() => openDm(a.id)}
                className={`flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-sm transition-colors ${
                  dmActive ? "bg-brand/15 font-medium text-brand" : "text-neutral-300 hover:bg-white/5"
                }`}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                  style={{ background: avatarColor(a.name) }}
                >
                  {initial(a.name)}
                </span>
                {a.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 导航 */}
      <div className="space-y-0.5 px-2 py-2">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
              pathname === n.href ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5"
            }`}
          >
            <span>{n.icon}</span> {n.label}
          </Link>
        ))}
      </div>

      {/* 模型接入状态 */}
      <Link
        href="/settings"
        className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs hover:bg-white/5"
      >
        <span
          className={`h-2 w-2 rounded-full ${key?.configured ? "bg-green-400" : "bg-orange-400"}`}
        />
        <span className="text-neutral-400">
          {key == null
            ? "…"
            : key.configured
              ? `已接入 · ${key.kind === "oauth" ? "Claude 登录" : "API Key"}`
              : "未接入模型"}
        </span>
      </Link>
    </aside>
  );
}
