"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AuthHeader from "@/components/auth-header";
import {
  type Channel,
  type ChatMessage,
  createChannel,
  listChannels,
  listMessages,
  streamChat,
} from "@/lib/api";

export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollDown = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight));

  // 载入频道,没有就建一个默认频道
  const loadChannels = useCallback(async () => {
    let chs = await listChannels();
    if (chs.length === 0) {
      await createChannel("general");
      chs = await listChannels();
    }
    setChannels(chs);
    setActive((cur) => cur ?? chs[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadChannels().catch(console.error);
  }, [loadChannels]);

  // 切换频道时载入历史
  useEffect(() => {
    if (!active) return;
    listMessages(active).then(setMessages).catch(console.error);
  }, [active]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || !active) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    scrollDown();
    try {
      for await (const ev of streamChat(active, text)) {
        if (ev.delta) {
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = {
              role: "assistant",
              content: copy[copy.length - 1].content + ev.delta,
            };
            return copy;
          });
          scrollDown();
        } else if (ev.error) {
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: `⚠️ ${ev.error}` };
            return copy;
          });
        }
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: `⚠️ 请求失败: ${String(e)}` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  async function newChannel() {
    const name = prompt("频道名称", "新频道");
    if (!name) return;
    const ch = await createChannel(name);
    setChannels((c) => [...c, ch]);
    setActive(ch.id);
  }

  return (
    <div className="flex h-screen">
      {/* 侧栏:频道列表 */}
      <aside className="flex w-56 flex-col bg-neutral-900 text-neutral-200">
        <div className="px-4 py-4 text-lg font-bold">
          Agora <span className="text-xs font-normal text-yellow-300">阶段1</span>
        </div>
        <div className="flex items-center justify-between px-4 py-1 text-xs text-neutral-400">
          <span>频道</span>
          <button onClick={newChannel} className="hover:text-yellow-300">
            + 新建
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm ${
                active === c.id ? "bg-yellow-300/15 text-yellow-300" : "hover:bg-white/5"
              }`}
            >
              # {c.name}
            </button>
          ))}
        </nav>
      </aside>

      {/* 主区 */}
      <main className="flex flex-1 flex-col bg-neutral-50">
        <header className="flex items-center justify-between border-b bg-neutral-900 px-5 py-3 text-white">
          <span className="font-semibold">
            # {channels.find((c) => c.id === active)?.name ?? "..."}
          </span>
          <AuthHeader />
        </header>

        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="mt-10 text-center text-neutral-400">和 AI 说点什么吧 —— 回复会逐字蹦出来，历史会保存。</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-yellow-300 text-neutral-900"
                    : "border border-neutral-200 bg-white text-neutral-800"
                }`}
              >
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2.5 border-t bg-white p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-neutral-900 px-5 font-semibold text-yellow-300 disabled:opacity-50"
          >
            {streaming ? "生成中…" : "发送"}
          </button>
        </div>
      </main>
    </div>
  );
}
