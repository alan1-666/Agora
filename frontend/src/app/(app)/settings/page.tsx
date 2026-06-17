"use client";

import { useEffect, useState } from "react";
import { claudeFinish, claudeStart, getKeyStatus, setOrgKey } from "@/lib/api";
import type { KeyStatus } from "@/lib/types";

export default function SettingsPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [oauthOpen, setOauthOpen] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = () =>
    getKeyStatus().then((s) => {
      setStatus(s);
      if (s.model) setModel(s.model);
    });
  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  async function startClaude() {
    setMsg("");
    const { url } = await claudeStart();
    window.open(url, "_blank");
    setOauthOpen(true);
  }
  async function finishClaude() {
    if (!code.trim()) return;
    try {
      await claudeFinish(code.trim());
      setCode("");
      setOauthOpen(false);
      setMsg("已用 Claude 订阅登录");
      await refresh();
    } catch (e) {
      setMsg(`登录失败：${String(e)}`);
    }
  }
  async function saveKey() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setMsg("");
    try {
      await setOrgKey(apiKey.trim(), model);
      setApiKey("");
      setMsg("已保存 API Key");
      await refresh();
    } catch (e) {
      setMsg(`保存失败：${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page title="设置 · 模型接入">
      <div className="mb-5 text-sm text-neutral-600">
        当前状态：
        {status == null ? (
          "…"
        ) : status.configured ? (
          <span className="font-medium text-green-600">
            已接入（{status.kind === "oauth" ? "Claude 订阅登录" : "API Key"} · {status.model}）
          </span>
        ) : (
          <span className="font-medium text-orange-600">未接入</span>
        )}
        {msg && <span className="ml-3 text-neutral-400">{msg}</span>}
      </div>

      <Card title="用 Claude 订阅登录" subtitle="推荐 · 无需 API Key">
        <p className="mb-3 text-sm text-neutral-500">
          用你的 Claude 账户授权，走订阅额度。
          <span className="text-orange-600">
            注意：非官方逆向方式，可能违反 Anthropic 条款、随其改动失效，账号有被标记风险。
          </span>
        </p>
        <Button onClick={startClaude}>开始登录 Claude</Button>
        {oauthOpen && (
          <div className="mt-3">
            <p className="mb-1.5 text-sm text-neutral-600">
              已在新标签打开授权页。授权后页面会给出一段授权码，粘贴到这里：
            </p>
            <div className="flex gap-2">
              <Input value={code} onChange={setCode} placeholder="粘贴授权码（形如 xxxx#yyyy）" />
              <Button onClick={finishClaude} disabled={!code.trim()}>
                完成
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="或：填 Anthropic API Key">
        <p className="mb-3 text-sm text-neutral-500">用自己的 API key 调模型，加密存储、不回显明文。</p>
        <Field label="API Key">
          <Input type="password" value={apiKey} onChange={setApiKey} placeholder="sk-ant-..." />
        </Field>
        <Field label="模型">
          <Input value={model} onChange={setModel} />
        </Field>
        <Button onClick={saveKey} disabled={saving || !apiKey.trim()}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </Card>
    </Page>
  );
}

/* ---------- 小型 UI 原语(内联,够本页用) ---------- */

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex h-14 items-center border-b border-hairline bg-white px-6 font-semibold">
        {title}
      </header>
      <div className="mx-auto max-w-2xl p-6">{children}</div>
    </div>
  );
}
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-2xl border border-hairline bg-white p-5">
      <h2 className="font-semibold text-neutral-900">
        {title}
        {subtitle && <span className="ml-2 text-xs font-normal text-neutral-400">{subtitle}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
    />
  );
}
function Button({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
    >
      {children}
    </button>
  );
}
