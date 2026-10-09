import { PlannerOutline } from "@/components/planner-outline";
import { ErrorState } from "@/components/page-states";
import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

export const dynamic = "force-dynamic";

export default async function OutlinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const outcome = await getProjectRepository().getById(projectId)
    .then((project) => ({ project, error: null }))
    .catch((error: unknown) => ({ project: null, error }));
  if (!outcome.project) {
    const code = outcome.error instanceof ProjectRepositoryError ? outcome.error.code : "PROJECT_READ_FAILED";
    return <ErrorState title={code === "PROJECT_NOT_FOUND" ? "项目不存在" : "方案结构读取失败"} description="无法读取当前项目的有效资料。请返回项目库或检查本地项目 JSON 后重试。" />;
  }
  return <PlannerOutline projectId={projectId} initialOutline={outcome.project.plannerOutline} />;
}
