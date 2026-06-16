import { API_URL } from "./config";

// 后端 API 客户端。
// 注:dev 模式下后端用内置 org,无需带 token。启用 Clerk 后(且后端接好 JWT 校验),
// 这里再补 Authorization: Bearer <clerk token>(留待后端 Clerk 校验落地时一起接)。
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export type Channel = { id: string; name: string };
export type ChatMessage = { role: "user" | "assistant"; content: string; seq?: number };

export const listChannels = () => req<Channel[]>("/api/channels");
export const createChannel = (name: string) =>
  req<Channel>("/api/channels", { method: "POST", body: JSON.stringify({ name }) });
export const listMessages = (channelId: string) =>
  req<ChatMessage[]>(`/api/channels/${channelId}/messages`);

export const getKeyStatus = () =>
  req<{ configured: boolean; model: string | null }>("/api/org/key");
export const setOrgKey = (api_key: string, model?: string) =>
  req<{ ok: boolean }>("/api/org/key", {
    method: "PUT",
    body: JSON.stringify({ api_key, model }),
  });

// 流式对话:返回一个异步迭代器,逐段吐出文本增量。
export async function* streamChat(
  channelId: string,
  content: string,
): AsyncGenerator<{ delta?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel_id: channelId, content }),
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
      yield payload;
    }
  }
}

export { API_URL };
