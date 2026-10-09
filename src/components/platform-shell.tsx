"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/dashboard", label: "工作台", icon: "dashboard" },
  { href: "/projects/a-village/workbench/overview", label: "AI项目编制台", icon: "workbench" },
  { href: "/projects", label: "项目库", icon: "projects" },
  { href: "/settings", label: "系统设置", icon: "settings" },
] as const;

type NavIconName = (typeof navigation)[number]["icon"];

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    workbench: <><path d="M12 3 14.1 8.9 20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-2.1L12 3Z" /><path d="m18.5 3 .6 1.9L21 5.5l-1.9.6L18.5 8l-.6-1.9L16 5.5l1.9-.6.6-1.9Z" /></>,
    projects: <><path d="M4 6.5h6l1.6 2H20v9.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z" /><path d="M2.5 10h18" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-frame">
      <aside className="platform-sidebar" aria-label="平台导航">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">AI</span>
          <span><strong>规策AI工作台</strong><small>规划技术方案智能编制</small></span>
        </Link>
        <nav className="primary-nav">
          {navigation.map((item) => {
            const active = item.href === "/projects/a-village/workbench/overview"
              ? pathname.startsWith("/projects/") && pathname.includes("/workbench/")
              : pathname === item.href || (item.href === "/projects" && pathname === "/projects");
            return <Link key={item.label} href={item.href} className={active ? "nav-item active" : "nav-item"} aria-current={active ? "page" : undefined}>
              <NavIcon name={item.icon} /><span>{item.label}</span>
            </Link>;
          })}
        </nav>
        <div className="sidebar-footer"><span className="avatar">张</span><span>项目工作台<br /><small>本地演示环境</small></span></div>
      </aside>
      <main className="page-area">{children}</main>
    </div>
  );
}
