"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { ProjectDocument } from "@/domain/projects/schema";

export function WorkbenchShell({ project, children }: { project: ProjectDocument; children: ReactNode }) {
  const pathname = usePathname();
  const base = `/projects/${project.projectId}/workbench`;
  const links = [
    ["项目总览", `${base}/overview`], ["项目资料", `${base}/materials`], ["方案结构", `${base}/outline`],
    ["成果与版本", `${base}/deliverables`],
  ] as const;
  const confirmed = project.plannerOutline.confirmedVersions.find((version) => version.version === project.plannerOutline.activeConfirmedVersion)?.content;
  const firstSection = confirmed?.chapters.flatMap((chapter) => chapter.sections.map((section) => ({ chapterId: chapter.nodeId, sectionId: section.nodeId })))[0];
  const chapterEntryHref = firstSection ? `${base}/chapters/${firstSection.chapterId}/sections/${firstSection.sectionId}` : `${base}/outline`;
  const reviewEntryHref = firstSection ? `${base}/reviews/${firstSection.chapterId}/sections/${firstSection.sectionId}` : `${base}/outline`;
  return <div className="workbench-frame">
    <header className="project-header"><div><span className="project-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5h6l1.7 2H20v10.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" /><path d="M7 12h10M7 16h7" /></svg></span><strong>{project.name}</strong><span className="status-chip">演示项目</span></div></header>
    <nav className="secondary-nav" aria-label="项目工作台导航">
      {links.slice(0, 3).map(([label, href]) => <Link key={label} href={href} className={pathname === href ? "secondary-link active" : "secondary-link"} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}
      <Link href={chapterEntryHref} className={pathname.includes("/chapters/") ? "secondary-link active" : "secondary-link"} aria-current={pathname.includes("/chapters/") ? "page" : undefined}>章节编制</Link>
      <Link href={reviewEntryHref} className={pathname.includes("/reviews/") ? "secondary-link active" : "secondary-link"} aria-current={pathname.includes("/reviews/") ? "page" : undefined}>内容校核</Link>
      {links.slice(3).map(([label, href]) => <Link key={label} href={href} className={pathname === href ? "secondary-link active" : "secondary-link"} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}
    </nav>
    <div className="workbench-content">{children}</div>
  </div>;
}
