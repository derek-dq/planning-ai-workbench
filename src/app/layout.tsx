import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PlatformShell } from "@/components/platform-shell";
import "./globals.css";

export const metadata: Metadata = { title: "规策AI工作台", description: "规划技术方案智能编制工作台" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="zh-CN"><body><PlatformShell>{children}</PlatformShell></body></html>;
}
