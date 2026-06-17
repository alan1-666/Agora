"use client";

import { useState } from "react";
import { createAgent, deleteAgent, updateAgent, type AgentInput } from "@/lib/api";
import { avatarColor, initial } from "@/lib/format";
import type { Agent } from "@/lib/types";
import { useWorkspace } from "@/components/workspace-context";

const BLANK: AgentInput = { name: "", system_prompt: "", tools: [] };

export default function AgentsPage() {
  const { agents, refreshAgents } = useWorkspace();
  const [editing, setEditing] = useState<{ id?: string; data: AgentInput } | null>(null);

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
          onClick={() => setEditing({ data: { ...BLANK } })}
          className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-white"
        >
          ＋ 新建成员
        </button>
      </header>

      <div className="mx-auto max-w-2xl p-6">
        <p className="mb-4 text-sm text-neutral-500">
          每个成员是一个有自己人设的 AI 同事。任务交给本机 Claude Code 执行（自带工具能力）。
        </p>
        <div className="space-y-3">
          {agents.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-2xl border border-hairline bg-white p-4">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ background: avatarColor(a.name) }}
              >
                {initial(a.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-neutral-900">{a.name}</div>
                <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">
                  {a.system_prompt || "（无人设）"}
                </p>
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
      </div>

      {editing && (
        <EditModal
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
  value,
  isNew,
  onChange,
  onClose,
  onSave,
}: {
  value: AgentInput;
  isNew: boolean;
  onChange: (v: AgentInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
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
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">人设（system prompt）</span>
          <textarea
            value={value.system_prompt}
            onChange={(e) => onChange({ ...value, system_prompt: e.target.value })}
            rows={4}
            placeholder="描述这个成员是谁、擅长什么、怎么干活。"
            className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </label>
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
