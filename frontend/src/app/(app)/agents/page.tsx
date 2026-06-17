"use client";

import { useEffect, useState } from "react";
import { createAgent, deleteAgent, listTools, updateAgent, type AgentInput } from "@/lib/api";
import { avatarColor, initial } from "@/lib/format";
import type { Agent } from "@/lib/types";
import { useWorkspace } from "@/components/workspace-context";

const BLANK: AgentInput = { name: "", system_prompt: "", tools: [] };

export default function AgentsPage() {
  const { agents, refreshAgents } = useWorkspace();
  const [tools, setTools] = useState<{ name: string; description: string }[]>([]);
  const [editing, setEditing] = useState<{ id?: string; data: AgentInput } | null>(null);

  useEffect(() => {
    listTools().then(setTools).catch(console.error);
  }, []);

  async function save() {
    if (!editing || !editing.data.name.trim()) return;
    if (editing.id) await updateAgent(editing.id, editing.data);
    else await createAgent(editing.data);
    setEditing(null);
    await refreshAgents();
  }
  async function remove(a: Agent) {
    if (!confirm(`删除成员「${a.name}」？`)) return;
    await deleteAgent(a.id);
    await refreshAgents();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex h-14 items-center justify-between border-b border-hairline bg-white px-6">
        <span className="font-semibold">AI 成员</span>
        <button
          onClick={() => setEditing({ data: { ...BLANK, tools: tools.map((t) => t.name) } })}
          className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-white"
        >
          ＋ 新建成员
        </button>
      </header>

      <div className="mx-auto max-w-2xl space-y-3 p-6">
        {agents.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-2xl border border-hairline bg-white p-4">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
              style={{ background: avatarColor(a.name) }}
            >
              {initial(a.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-neutral-900">{a.name}</div>
              <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{a.system_prompt}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {a.tools.map((t) => (
                  <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 gap-2 text-sm">
              <button
                onClick={() => setEditing({ id: a.id, data: { name: a.name, system_prompt: a.system_prompt, model: a.model, tools: a.tools } })}
                className="text-neutral-500 hover:text-neutral-900"
              >
                编辑
              </button>
              <button onClick={() => remove(a)} className="text-neutral-400 hover:text-red-500">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditModal
          tools={tools}
          value={editing.data}
          isNew={!editing.id}
          onChange={(data) => setEditing({ ...editing, data })}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function EditModal({
  tools,
  value,
  isNew,
  onChange,
  onClose,
  onSave,
}: {
  tools: { name: string; description: string }[];
  value: AgentInput;
  isNew: boolean;
  onChange: (v: AgentInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const toggle = (t: string) =>
    onChange({
      ...value,
      tools: value.tools.includes(t) ? value.tools.filter((x) => x !== t) : [...value.tools, t],
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-semibold">{isNew ? "新建成员" : "编辑成员"}</h2>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">名字</span>
          <input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="如：翻译、调研、文案"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">人设（system prompt）</span>
          <textarea
            value={value.system_prompt}
            onChange={(e) => onChange({ ...value, system_prompt: e.target.value })}
            rows={3}
            placeholder="描述这个成员是谁、擅长什么、怎么干活。"
            className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </label>
        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-medium text-neutral-700">工具</span>
          <div className="flex flex-wrap gap-2">
            {tools.map((t) => {
              const on = value.tools.includes(t.name);
              return (
                <button
                  key={t.name}
                  onClick={() => toggle(t.name)}
                  title={t.description}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    on ? "border-brand/40 bg-brand-soft text-brand" : "border-hairline text-neutral-500"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100">
            取消
          </button>
          <button
            onClick={onSave}
            disabled={!value.name.trim()}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
