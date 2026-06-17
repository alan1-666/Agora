import { API_URL } from "./config";
import type { Agent, Channel, ChatEvent, ChatMessage, Doc, KeyStatus } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

// 频道
export const listChannels = () => req<Channel[]>("/api/channels");
export const createChannel = (name: string) =>
  req<Channel>("/api/channels", { method: "POST", body: JSON.stringify({ name }) });
export const listMessages = (channelId: string) =>
  req<ChatMessage[]>(`/api/channels/${channelId}/messages`);

// agents / 文档
export const listAgents = () => req<Agent[]>("/api/agents");
export const listTools = () => req<{ name: string; description: string }[]>("/api/tools");
export type AgentInput = { name: string; system_prompt: string; model?: string | null; tools: string[] };
export const createAgent = (a: AgentInput) =>
  req<Agent>("/api/agents", { method: "POST", body: JSON.stringify(a) });
export const updateAgent = (id: string, a: AgentInput) =>
  req<Agent>(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(a) });
export const deleteAgent = (id: string) =>
  req<{ ok: boolean }>(`/api/agents/${id}`, { method: "DELETE" });
export const listDocuments = () => req<Doc[]>("/api/documents");
export const uploadDocument = (name: string, text: string) =>
  req<{ id: string; name: string; chunks: number }>("/api/documents", {
    method: "POST",
    body: JSON.stringify({ name, text }),
  });

// 模型凭证
export const getKeyStatus = () => req<KeyStatus>("/api/org/key");
export const setOrgKey = (api_key: string, model?: string) =>
  req<{ ok: boolean }>("/api/org/key", { method: "PUT", body: JSON.stringify({ api_key, model }) });

// Claude 订阅 OAuth
export const claudeStart = () => req<{ url: string }>("/api/auth/claude/start", { method: "POST" });
export const claudeFinish = (code: string) =>
  req<{ ok: boolean }>("/api/auth/claude/finish", { method: "POST", body: JSON.stringify({ code }) });

// 流式对话:逐个吐出 SSE 事件(经 agent,可能含工具调用)。
export async function* streamChat(
  channelId: string,
  content: string,
  agentId?: string,
): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel_id: channelId, content, agent_id: agentId }),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6));
      if (payload.done) return;
      yield payload as ChatEvent;
    }
  }
}
