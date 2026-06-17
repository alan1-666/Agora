import { avatarColor, initial } from "@/lib/format";
import type { Role } from "@/lib/types";

// 一条消息(Slack 风:头像 + 作者 + 内容)。同一作者连续消息分组,只在组首显示头像/作者。
export default function MessageItem({
  role,
  author,
  content,
  grouped,
  streaming,
}: {
  role: Role;
  author: string;
  content: string;
  grouped: boolean; // true=承接上一条同作者消息,省略头像/作者
  streaming?: boolean;
}) {
  const isUser = role === "user";
  const bg = isUser ? "#3f3f46" : avatarColor(author);

  return (
    <div className={`flex gap-3 px-5 ${grouped ? "mt-0.5" : "mt-4"}`}>
      <div className="w-8 shrink-0">
        {!grouped && (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ background: bg }}
          >
            {initial(author)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="mb-0.5 text-sm font-semibold text-neutral-900">{author}</div>
        )}
        <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-800">
          {content || (streaming ? <span className="text-neutral-400">▍</span> : "")}
        </div>
      </div>
    </div>
  );
}
