import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// 配了 Clerk key 才挂 Clerk 中间件;否则放行(dev 模式)。
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default clerkEnabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
