import type { ReactNode } from "react";

import { WorkbenchShell } from "@/components/workbench-shell";
import { demoProject } from "@/domain/projects/demo-project";
import { getProjectRepository } from "@/server/projects/project-repository";

export const dynamic = "force-dynamic";

export default async function ProjectWorkbenchLayout({ children, params }: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProjectRepository().getById(projectId).catch(() => ({ ...demoProject, projectId, name: "项目工作台" }));
  return <WorkbenchShell project={project}>{children}</WorkbenchShell>;
}
