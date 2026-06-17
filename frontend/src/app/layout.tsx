import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agora",
  description: "人 + AI 智能体协作工作空间",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
