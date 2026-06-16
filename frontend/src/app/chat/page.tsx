"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AuthHeader from "@/components/auth-header";
import {
  type Agent,
  type Channel,
  createChannel,
  listAgents,
  listChannels,
  listMessages,
  streamChat,
} from "@/lib/api";

// UI 消息项:用户/助手气泡,或一条工具调用记录(🔧)
type Item =
  | { kind: "user" | "assistant"; content: string }
  | { kind: "tool"; name: string; input: string; output?: string };

// 把 delegate 的入参(JSON 字符串)渲染成「→ 助手: 任务」
function renderDelegate(input: string): string {
  try {
    const { agent, task } = JSON.parse(input);
    return `→ ${agent}: ${task}`;
  } catch {
    return input;
  }
}

export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollDown = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight));

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
    listAgents()
      .then((a) => {
        setAgents(a);
        setAgentId((cur) => cur || a[0]?.id || "");
      })
      .catch(console.error);
  }, [loadChannels]);

  useEffect(() => {
    if (!active) return;
    listMessages(active)
      .then((ms) => setItems(ms.map((m) => ({ kind: m.role, content: m.content }) as Item)))
      .catch(console.error);
  }, [active]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || !active) return;
    setInput("");

    const buf: Item[] = [...items, { kind: "user", content: text }];
    setItems([...buf]);
    setStreaming(true);
    scrollDown();

    let openAssistant = -1; // 当前正在追加的助手气泡下标;-1 表示需新建
    try {
      for await (const ev of streamChat(active, text, agentId || undefined)) {
        if (ev.delta) {
          if (openAssistant === -1) {
            buf.push({ kind: "assistant", content: "" });
            openAssistant = buf.length - 1;
          }
          const cur = buf[openAssistant] as { kind: "assistant"; content: string };
          buf[openAssistant] = { kind: "assistant", content: cur.content + ev.delta };
        } else if (ev.tool_call) {
          openAssistant = -1; // 工具调用前先收尾当前气泡
          buf.push({
            kind: "tool",
            name: ev.tool_call.name,
            input: JSON.stringify(ev.tool_call.input),
          });
        } else if (ev.tool_result) {
          for (let i = buf.length - 1; i >= 0; i--) {
            const it = buf[i];
            if (it.kind === "tool" && it.output === undefined) {
              buf[i] = { ...it, output: ev.tool_result.output };
              break;
            }
          }
        } else if (ev.error) {
          buf.push({ kind: "assistant", content: `⚠️ ${ev.error}` });
          openAssistant = -1;
        }
        setItems([...buf]);
        scrollDown();
      }
    } catch (e) {
      buf.push({ kind: "assistant", content: `⚠️ 请求失败: ${String(e)}` });
      setItems([...buf]);
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
      {/* 侧栏 */}
      <aside className="flex w-56 flex-col bg-neutral-900 text-neutral-200">
        <div className="px-4 py-4 text-lg font-bold">
          Agora <span className="text-xs font-normal text-yellow-300">阶段2</span>
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
          <div className="flex items-center gap-3">
            <span className="font-semibold">
              # {channels.find((c) => c.id === active)?.name ?? "..."}
            </span>
            {/* agent 选择器 */}
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-100 outline-none"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  🤖 {a.name}（{a.tools.length} 工具）
                </option>
              ))}
            </select>
          </div>
          <AuthHeader />
        </header>

        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
          {items.length === 0 && (
            <div className="mt-10 text-center text-neutral-400">
              试试「现在几点」或「帮我算 (13×17)+5」—— agent 会自己调用工具。
            </div>
          )}
          {items.map((it, i) =>
            it.kind === "tool" ? (
              it.name === "delegate" ? (
                // 委派:多智能体——协调者把子任务派给另一个 agent
                <div key={i} className="flex justify-start">
                  <div className="max-w-[85%] rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs text-purple-800">
                    🤝 <b>委派</b> {renderDelegate(it.input)}
                    {it.output !== undefined && (
                      <div className="mt-1 border-l-2 border-purple-300 pl-2 text-purple-700">
                        ↳ {it.output}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
                    🔧 <b>{it.name}</b>({it.input}){" "}
                    {it.output !== undefined ? (
                      <>
                        → <span className="font-mono">{it.output}</span>
                      </>
                    ) : (
                      "…"
                    )}
                  </div>
                </div>
              )
            ) : (
              <div key={i} className={`flex ${it.kind === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    it.kind === "user"
                      ? "bg-yellow-300 text-neutral-900"
                      : "border border-neutral-200 bg-white text-neutral-800"
                  }`}
                >
                  {it.content || (streaming && i === items.length - 1 ? "…" : "")}
                </div>
              </div>
            ),
          )}
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
