"use client";

import { useEffect, useState } from "react";
import { listDocuments, uploadDocument } from "@/lib/api";
import type { Doc } from "@/lib/types";

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
      setMsg(`上传失败：${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex h-14 items-center border-b border-hairline bg-white px-6 font-semibold">
        资料库
      </header>
      <div className="mx-auto max-w-2xl p-6">
        <p className="mb-4 text-sm text-neutral-500">
          上传文本资料后，agent 回答时会自动检索相关内容并参考、标注来源（RAG）。
        </p>

        <section className="mb-6 rounded-2xl border border-hairline bg-white p-5">
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">资料名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：员工手册"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">内容</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="粘贴文本内容…"
              className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </label>
          <button
            onClick={upload}
            disabled={saving || !name.trim() || !text.trim()}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "上传中…" : "上传"}
          </button>
          {msg && <span className="ml-3 text-sm text-neutral-400">{msg}</span>}
        </section>

        <h2 className="mb-2 text-sm font-semibold text-neutral-700">已有资料（{docs.length}）</h2>
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-hairline bg-white">
          {docs.length === 0 && <li className="px-4 py-3 text-sm text-neutral-400">还没有资料</li>}
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700">
              <span>📄</span> {d.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
