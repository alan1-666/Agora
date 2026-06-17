import { useState } from "react";

// 底部输入框:Enter 发送,Shift+Enter 换行。
export default function Composer({
  disabled,
  onSend,
  placeholder,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");

  function submit() {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="px-5 pb-5 pt-2">
      <div className="flex items-end gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 shadow-sm focus-within:border-neutral-400">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none"
          style={{ minHeight: "1.75rem" }}
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="mb-0.5 shrink-0 rounded-lg bg-brand-ink px-4 py-1.5 text-sm font-semibold text-brand transition-opacity disabled:opacity-40"
        >
          {disabled ? "生成中" : "发送"}
        </button>
      </div>
      <div className="mt-1.5 px-1 text-xs text-neutral-400">Enter 发送 · Shift+Enter 换行</div>
    </div>
  );
}
