// Clerk 是否启用:配了 publishable key 就启用真鉴权,否则走 dev 模式(后端 DEV_MODE 用内置 org)。
// NEXT_PUBLIC_ 变量在构建时静态注入,前后端逻辑都读它判断模式。
export const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
