import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 紧凑的 markdown 渲染(适配聊天):加粗/列表/代码/表格/链接等。
export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-brand underline">
            {children}
          </a>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        h1: ({ children }) => <h1 className="mb-1 mt-2 text-base font-bold first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-1 mt-2 text-[15px] font-bold first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="my-1 border-l-2 border-neutral-300 pl-3 text-neutral-500">{children}</blockquote>
        ),
        code: ({ className, children }) => {
          const inline = !className;
          return inline ? (
            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[13px] text-pink-700">{children}</code>
          ) : (
            <code className={`${className} font-mono text-[13px]`}>{children}</code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-1.5 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-[13px] leading-relaxed text-neutral-100">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-1.5 overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-hairline bg-neutral-50 px-2 py-1 text-left font-medium">{children}</th>,
        td: ({ children }) => <td className="border border-hairline px-2 py-1">{children}</td>,
        hr: () => <hr className="my-2 border-hairline" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
