"use client";

import Link from "next/link";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/config";

// 仅在 Clerk 启用时挂载(在 ClerkProvider 内),所以可安全调用 useUser。
function ClerkArea() {
  const { isSignedIn } = useUser();
  return isSignedIn ? (
    <UserButton />
  ) : (
    <SignInButton>
      <button className="rounded bg-yellow-300 px-3 py-1 text-sm font-semibold text-neutral-900">
        登录
      </button>
    </SignInButton>
  );
}

// 顶栏右侧鉴权区:启用 Clerk 显示登录/用户菜单;dev 模式显示角标。
export default function AuthHeader() {
  return (
    <div className="flex items-center gap-3">
      <Link href="/documents" className="text-sm text-neutral-300 hover:text-yellow-300">
        资料库
      </Link>
      <Link href="/settings" className="text-sm text-neutral-300 hover:text-yellow-300">
        设置
      </Link>
      {CLERK_ENABLED ? (
        <ClerkArea />
      ) : (
        <span className="rounded bg-neutral-700 px-2 py-1 text-xs text-yellow-300">DEV 模式</span>
      )}
    </div>
  );
}
