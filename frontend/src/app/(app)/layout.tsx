import Sidebar from "@/components/layout/Sidebar";
import { WorkspaceProvider } from "@/components/workspace-context";

// 应用主壳:左侧栏 + 内容区。聊天/资料库/设置共用,频道与 agent 状态走 WorkspaceProvider。
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen overflow-hidden bg-canvas">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col bg-canvas">{children}</main>
      </div>
    </WorkspaceProvider>
  );
}
