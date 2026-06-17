import { API_URL } from "./config";
import type { Agent, Channel, ChannelEvent, ChatMessage } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // 只有带 body 的请求才加 Content-Type;GET 不加,避免触发无谓的 CORS 预检
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

// 频道
export const listChannels = () => req<Channel[]>("/api/channels");
export const createChannel = (name: string) =>
  req<Channel>("/api/channels", { method: "POST", body: JSON.stringify({ name }) });
export const listMessages = (channelId: string) =>
  req<ChatMessage[]>(`/api/channels/${channelId}/messages`);
export const listThread = (rootId: string) => req<ChatMessage[]>(`/api/threads/${rootId}`);

// 频道成员
export const listMembers = (channelId: string) => req<Agent[]>(`/api/channels/${channelId}/members`);
export const addMember = (channelId: string, agentId: string) =>
  req<{ ok: boolean }>(`/api/channels/${channelId}/members`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId }),
  });
export const removeMember = (channelId: string, agentId: string) =>
  req<{ ok: boolean }>(`/api/channels/${channelId}/members/${agentId}`, { method: "DELETE" });

export const listDms = () => req<Channel[]>("/api/dms");
export const openDm = (agentId: string) =>
  req<Channel>("/api/dms", { method: "POST", body: JSON.stringify({ agent_id: agentId }) });

// 运行时:Raft 模式靠本机 claude CLI 执行
export const getRuntimeStatus = () => req<{ available: boolean; version: string }>("/api/runtime");

// agents
export const listAgents = () => req<Agent[]>("/api/agents");
export type AgentInput = { name: string; system_prompt: string; model?: string | null; tools: string[] };
export const createAgent = (a: AgentInput) =>
  req<Agent>("/api/agents", { method: "POST", body: JSON.stringify(a) });
export const updateAgent = (id: string, a: AgentInput) =>
  req<Agent>(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(a) });
export const deleteAgent = (id: string) =>
  req<{ ok: boolean }>(`/api/agents/${id}`, { method: "DELETE" });

// 派活:把任务交给后端(立即返回),agent 在后台干,结果经频道流推回。
export const dispatch = (channelId: string, content: string, agentId?: string, threadId?: string) =>
  req<{ ok: boolean }>("/api/chat/dispatch", {
    method: "POST",
    body: JSON.stringify({ channel_id: channelId, content, agent_id: agentId, thread_id: threadId }),
  });

// 频道实时事件流(SSE):订阅后回调收到 {type:"message"|"activity",...}。返回取消订阅函数。
export function subscribeChannel(channelId: string, onEvent: (ev: ChannelEvent) => void): () => void {
  const es = new EventSource(`${API_URL}/api/channels/${channelId}/stream`);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as ChannelEvent);
    } catch {
      /* 忽略心跳/非 JSON */
    }
  };
  return () => es.close();
}
