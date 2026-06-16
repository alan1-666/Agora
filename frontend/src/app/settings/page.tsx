"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getKeyStatus, setOrgKey } from "@/lib/api";

// 组织设置:配置本组织的 Anthropic API key(BYO-key)。
export default function SettingsPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [inputModel, setInputModel] = useState("claude-sonnet-4-6");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = () =>
    getKeyStatus().then((s) => {
      setConfigured(s.configured);
      setModel(s.model);
      if (s.model) setInputModel(s.model);
    });

  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  async function save() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setMsg("");
    try {
      await setOrgKey(apiKey.trim(), inputModel);
      setApiKey("");
      setMsg("已保存");
      await refresh();
    } catch (e) {
      setMsg(`保存失败: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">组织设置</h1>
        <Link href="/chat" className="text-sm text-blue-600 hover:underline">
          ← 返回聊天
        </Link>
      </div>

      <section className="rounded-lg border border-neutral-200 p-5">
        <h2 className="mb-1 font-semibold">模型 API Key（BYO-key）</h2>
        <p className="mb-4 text-sm text-neutral-500">
          本组织用自己的 Anthropic key 调模型。key 会加密存储，不会回显明文。
        </p>

        <div className="mb-3 text-sm">
          当前状态：
          {configured === null ? (
            "加载中…"
          ) : configured ? (
            <span className="text-green-600">已配置（模型 {model}）</span>
          ) : (
            <span className="text-orange-600">未配置</span>
          )}
        </div>

        <label className="mb-1 block text-sm font-medium">Anthropic API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="mb-3 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
        />

        <label className="mb-1 block text-sm font-medium">模型</label>
        <input
          value={inputModel}
          onChange={(e) => setInputModel(e.target.value)}
          className="mb-4 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
        />

        <button
          onClick={save}
          disabled={saving || !apiKey.trim()}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-yellow-300 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {msg && <span className="ml-3 text-sm text-neutral-500">{msg}</span>}
      </section>
    </div>
  );
}
