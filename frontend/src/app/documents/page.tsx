"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Doc, listDocuments, uploadDocument } from "@/lib/api";

// 资料库:上传文本资料,供 agent 检索(RAG)。
export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = () => listDocuments().then(setDocs).catch(console.error);
  useEffect(() => {
    refresh();
  }, []);

  async function upload() {
    if (!name.trim() || !text.trim()) return;
    setSaving(true);
    setMsg("");
    try {
      const r = await uploadDocument(name.trim(), text.trim());
      setMsg(`已上传，切成 ${r.chunks} 块`);
      setName("");
      setText("");
      await refresh();
    } catch (e) {
      setMsg(`上传失败: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">资料库</h1>
        <Link href="/chat" className="text-sm text-blue-600 hover:underline">
          ← 返回聊天
        </Link>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        上传文本资料后，agent 回答时会自动检索相关内容并参考、标注来源（RAG）。
      </p>

      <section className="mb-6 rounded-lg border border-neutral-200 p-5">
        <label className="mb-1 block text-sm font-medium">资料名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：员工手册"
          className="mb-3 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
        />
        <label className="mb-1 block text-sm font-medium">内容</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="粘贴文本内容…"
          className="mb-3 w-full resize-y rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
        />
        <button
          onClick={upload}
          disabled={saving || !name.trim() || !text.trim()}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-yellow-300 disabled:opacity-50"
        >
          {saving ? "上传中…" : "上传"}
        </button>
        {msg && <span className="ml-3 text-sm text-neutral-500">{msg}</span>}
      </section>

      <h2 className="mb-2 font-semibold">已有资料（{docs.length}）</h2>
      <ul className="divide-y rounded-lg border border-neutral-200">
        {docs.length === 0 && <li className="px-4 py-3 text-sm text-neutral-400">还没有资料</li>}
        {docs.map((d) => (
          <li key={d.id} className="px-4 py-3 text-sm">
            📄 {d.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
