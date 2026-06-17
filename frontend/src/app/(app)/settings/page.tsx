"use client";

import { useEffect, useState } from "react";
import { getRuntimeStatus } from "@/lib/api";

export default function SettingsPage() {
  const [rt, setRt] = useState<{ available: boolean; version: string } | null>(null);

  useEffect(() => {
    getRuntimeStatus().then(setRt).catch(console.error);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex h-14 items-center border-b border-hairline bg-white px-6 font-semibold">
        设置
      </header>
      <div className="mx-auto max-w-2xl p-6">
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <h2 className="font-semibold text-neutral-900">运行时 · 本机 Claude Code</h2>
          <p className="mt-1 mb-4 text-sm text-neutral-500">
            Agora 把任务交给你本机的 <code className="rounded bg-neutral-100 px-1">claude</code> CLI 执行，
            用你已登录的 Claude 订阅 —— <b className="text-neutral-700">无需 API Key、无需额外授权</b>。
          </p>

          <div className="flex items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${rt?.available ? "bg-emerald-500" : "bg-amber-500"}`} />
            {rt == null ? (
              "检测中…"
            ) : rt.available ? (
              <span className="text-neutral-700">
                已就绪 · <span className="font-mono text-neutral-500">{rt.version}</span>
              </span>
            ) : (
              <span className="text-amber-700">未检测到 claude CLI</span>
            )}
          </div>

          {rt && !rt.available && (
            <p className="mt-3 text-sm text-neutral-500">
              请先安装并登录 Claude Code：
              <code className="ml-1 rounded bg-neutral-100 px-1">npm i -g @anthropic-ai/claude-code</code>，
              然后运行 <code className="rounded bg-neutral-100 px-1">claude</code> 登录一次。
            </p>
          )}
        </section>

        <p className="mt-4 px-1 text-xs text-neutral-400">
          执行交给本机 claude（自带工具/文件能力），用你的订阅。
        </p>
      </div>
    </div>
  );
}
