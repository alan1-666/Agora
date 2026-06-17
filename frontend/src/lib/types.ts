// 前端共享类型。

export type Role = "user" | "assistant";

export type Channel = { id: string; name: string; kind?: string; agent_id?: string | null };

export type Agent = {
  id: string;
  name: string;
  system_prompt: string;
  model: string | null;
  tools: string[];
};

export type Doc = { id: string; name: string };

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  seq?: number;
  reply_count?: number;
};

// 聊天流里的一项:用户/助手消息,或一条工具调用记录。
export type ChatItem =
  | { kind: "message"; role: Role; content: string; id?: string; replyCount?: number }
  | { kind: "tool"; name: string; input: string; output?: string };

// SSE 流式事件
export type ChatEvent = {
  delta?: string;
  tool_call?: { name: string; input: Record<string, unknown> };
  tool_result?: { name: string; output: string };
  error?: string;
};

export type KeyStatus = { configured: boolean; kind?: string; model: string | null };
