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
            <div
              key={a.id}
              className="group flex items-start gap-3 rounded-2xl border border-hairline bg-white p-4 transition-colors hover:border-brand/30"
            >
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
  const inputCls =
    "w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand/50 focus:bg-white focus:ring-4 focus:ring-brand-soft";
  return (
    <div
      className="animate-overlay fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-pop w-full max-w-lg rounded-3xl border border-hairline bg-white p-6 shadow-[0_24px_70px_-15px_rgba(19,23,34,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white"
            style={{ background: avatarColor(value.name || "新") }}
          >
            {initial(value.name || "新")}
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">{isNew ? "新建成员" : "编辑成员"}</h2>
            <p className="text-xs text-neutral-400">一个有自己人设的 AI 同事</p>
          </div>
        </div>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-700">名字</span>
          <input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="如：翻译、调研、文案"
            className={inputCls}
          />
        </label>
        <label className="mb-5 block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-700">人设（system prompt）</span>
          <textarea
            value={value.system_prompt}
            onChange={(e) => onChange({ ...value, system_prompt: e.target.value })}
            rows={5}
            placeholder="描述这个成员是谁、擅长什么、怎么干活。"
            className={`${inputCls} resize-y leading-relaxed`}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-black/[0.04] hover:text-neutral-700"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={!value.name.trim()}
            className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-hover disabled:opacity-40 disabled:shadow-none"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
