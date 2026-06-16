import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agora",
  description: "人 + AI 智能体协作工作空间",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tree = (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
  // 启用 Clerk 时才包 Provider;否则直接渲染(dev 模式)
  return CLERK_ENABLED ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
