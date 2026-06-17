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
      <div className="flex items-end gap-2 rounded-2xl border border-hairline bg-white px-3.5 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-colors focus-within:border-brand/40">
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
          className="max-h-40 flex-1 resize-none bg-transparent py-1 text-[15px] outline-none placeholder:text-neutral-400"
          style={{ minHeight: "1.75rem" }}
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="shrink-0 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-hover disabled:opacity-40"
        >
          {disabled ? "生成中" : "发送"}
        </button>
      </div>
      <div className="mt-1.5 px-1 text-xs text-neutral-400">Enter 发送 · Shift+Enter 换行</div>
    </div>
  );
}
