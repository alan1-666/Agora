import { formatDelegate } from "@/lib/format";

// 一条工具调用记录:普通工具 🔧;委派(多智能体)🤝 特殊样式。
export default function ToolRow({
  name,
  input,
  output,
}: {
  name: string;
  input: string;
  output?: string;
}) {
  const pending = output === undefined;

  if (name === "delegate") {
    return (
      <div className="ml-11 my-1 max-w-[80%] rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs">
        <div className="font-medium text-violet-800">🤝 委派 · {formatDelegate(input)}</div>
        {pending ? (
          <div className="mt-1 text-violet-400">执行中…</div>
        ) : (
          <div className="mt-1 whitespace-pre-wrap border-l-2 border-violet-300 pl-2 text-violet-700">
            {output}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ml-11 my-1 inline-flex max-w-[80%] items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs text-sky-700">
      <span>🔧</span>
      <span className="font-medium">{name}</span>
      <span className="text-sky-400">({input})</span>
      {!pending && (
        <>
          <span className="text-sky-300">→</span>
          <span className="font-mono text-sky-800">{output}</span>
        </>
      )}
    </div>
  );
}
