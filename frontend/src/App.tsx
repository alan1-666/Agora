import { useRef, useState } from "react";
import "./App.css";

type Msg = { role: "user" | "assistant"; content: string };

const API = "http://localhost:8000";

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight));

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    // 先把用户消息和一条空的 assistant 占位推进去
    const next: Msg[] = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(next);
    setStreaming(true);
    scrollToBottom();

    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 只发到用户这条为止的历史(不含刚加的空 assistant 占位)
        body: JSON.stringify({ messages: next.slice(0, -1) }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // 按 SSE 事件(空行分隔)切分
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.delta) {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = {
                role: "assistant",
                content: copy[copy.length - 1].content + payload.delta,
              };
              return copy;
            });
            scrollToBottom();
          } else if (payload.error) {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: `⚠️ 出错: ${payload.error}` };
              return copy;
            });
          }
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: `⚠️ 请求失败: ${String(e)}` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <b>Agora</b> <span className="tag">阶段 0 · 流式单 agent</span>
      </header>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && <div className="empty">和 AI 说点什么吧 —— 回复会逐字蹦出来。</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="bubble">{m.content || (streaming && i === messages.length - 1 ? "…" : "")}</div>
          </div>
        ))}
      </div>

      <div className="composer">
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
        />
        <button onClick={send} disabled={streaming || !input.trim()}>
          {streaming ? "生成中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
