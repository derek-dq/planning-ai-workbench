import { ErrorState } from "@/components/page-states";
import { ProjectMaterials } from "@/components/project-materials";
import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const outcome = await getProjectRepository()
    .getMaterials(projectId)
    .then((result) => ({ result, error: null }))
    .catch((error: unknown) => ({ result: null, error }));
  if (!outcome.result) {
    const code = outcome.error instanceof ProjectRepositoryError ? outcome.error.code : "PROJECT_READ_FAILED";
    const title = code === "PROJECT_NOT_FOUND" ? "项目不存在" : "项目资料读取失败";
    return (
      <ErrorState
        title={title}
        description="无法读取当前项目的有效资料。请返回项目库或检查本地项目 JSON 后重试。"
      />
    );
  }
  return (
    <ProjectMaterials
      projectId={projectId}
      initialMaterials={outcome.result.materials}
      initialReadiness={outcome.result.readiness}
    />
  );
}
