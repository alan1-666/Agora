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
  parent_id?: string | null;
};

// 聊天流里的一项:用户/助手消息,或一条工具调用记录。
export type ChatItem =
  | { kind: "message"; role: Role; content: string; id?: string; replyCount?: number }
  | { kind: "tool"; name: string; input: string; output?: string };

// 频道实时事件(派活产生的消息与 agent 活动)
export type ChannelEvent =
  | { type: "message"; message: ChatMessage }
  | {
      type: "activity";
      state?: "working" | "done";
      kind?: "delta" | "tool_call" | "tool_result" | "error";
      agent?: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      output?: string;
    };

export type KeyStatus = { configured: boolean; kind?: string; model: string | null };
