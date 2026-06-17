// 展示用小工具。

/** 取名字首字符作头像字母。 */
export function initial(name: string): string {
  return (name?.[0] ?? "?").toUpperCase();
}

/** 把 delegate 的入参(JSON 字符串)渲染成「→ 助手: 任务」。 */
export function formatDelegate(input: string): string {
  try {
    const { agent, task } = JSON.parse(input);
    return `${agent} ← ${task}`;
  } catch {
    return input;
  }
}

/** 从消息文本里解析 @某agent,返回被 @ 的 agent(没有则 null)。 */
export function resolveMention<T extends { name: string }>(text: string, agents: T[]): T | null {
  // 名字长的优先(避免 "@助手" 命中 "@助手2" 的前缀歧义反向情况)
  const sorted = [...agents].sort((a, b) => b.name.length - a.name.length);
  for (const a of sorted) {
    if (text.includes("@" + a.name)) return a;
  }
  return null;
}

/** 根据名字稳定生成一个柔和的头像底色。 */
export function avatarColor(name: string): string {
  const palette = ["#f97316", "#0ea5e9", "#8b5cf6", "#10b981", "#ef4444", "#eab308"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
