"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { claudeFinish, claudeStart, getKeyStatus, setOrgKey } from "@/lib/api";

// 设置:模型接入 —— 用 Claude 订阅登录(OAuth)或填 API key。
export default function SettingsPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [kind, setKind] = useState<string | undefined>();
  const [model, setModel] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [inputModel, setInputModel] = useState("claude-sonnet-4-6");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // Claude 登录
  const [oauthCode, setOauthCode] = useState("");
  const [oauthOpen, setOauthOpen] = useState(false);
  const [oauthMsg, setOauthMsg] = useState("");

  const refresh = () =>
    getKeyStatus().then((s) => {
      setConfigured(s.configured);
      setKind(s.kind);
      setModel(s.model);
      if (s.model) setInputModel(s.model);
    });

  async function startClaude() {
    setOauthMsg("");
    const { url } = await claudeStart();
    window.open(url, "_blank");
    setOauthOpen(true);
  }

  async function finishClaude() {
    if (!oauthCode.trim()) return;
    setOauthMsg("");
    try {
      await claudeFinish(oauthCode.trim());
      setOauthCode("");
      setOauthOpen(false);
      setOauthMsg("已用 Claude 订阅登录");
      await refresh();
    } catch (e) {
      setOauthMsg(`登录失败: ${String(e)}`);
    }
  }

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
        <h1 className="text-xl font-bold">设置 · 模型接入</h1>
        <Link href="/chat" className="text-sm text-blue-600 hover:underline">
          ← 返回聊天
        </Link>
      </div>

      <div className="mb-4 text-sm">
        当前状态：
        {configured === null ? (
          "加载中…"
        ) : configured ? (
          <span className="text-green-600">
            已接入（{kind === "oauth" ? "Claude 订阅登录" : "API Key"}，模型 {model}）
          </span>
        ) : (
          <span className="text-orange-600">未接入</span>
        )}
      </div>

      {/* 方式一:用 Claude 订阅登录(OAuth) */}
      <section className="mb-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="mb-1 font-semibold">用 Claude 订阅登录（推荐，无需 API Key）</h2>
        <p className="mb-3 text-sm text-neutral-500">
          用你的 Claude 账户授权，走订阅额度，不必单独申请 API Key。
          <br />
          <span className="text-orange-600">
            注意：这是非官方逆向方式，可能违反 Anthropic 条款、并随其改动失效，账号有被标记风险。
          </span>
        </p>
        <button
          onClick={startClaude}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-yellow-300"
        >
          开始登录 Claude
        </button>
        {oauthOpen && (
          <div className="mt-3">
            <p className="mb-1 text-sm text-neutral-600">
              已在新标签打开授权页。授权后页面会给出一段授权码，粘贴到这里：
            </p>
            <div className="flex gap-2">
              <input
                value={oauthCode}
                onChange={(e) => setOauthCode(e.target.value)}
                placeholder="粘贴授权码（形如 xxxx#yyyy）"
                className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
              />
              <button
                onClick={finishClaude}
                disabled={!oauthCode.trim()}
                className="rounded bg-neutral-900 px-4 text-sm font-semibold text-yellow-300 disabled:opacity-50"
              >
                完成
              </button>
            </div>
          </div>
        )}
        {oauthMsg && <p className="mt-2 text-sm text-neutral-500">{oauthMsg}</p>}
      </section>

      {/* 方式二:填 API Key */}
      <section className="rounded-lg border border-neutral-200 p-5">
        <h2 className="mb-1 font-semibold">或：填 Anthropic API Key</h2>
        <p className="mb-4 text-sm text-neutral-500">用自己的 API key 调模型。key 会加密存储，不会回显明文。</p>

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
