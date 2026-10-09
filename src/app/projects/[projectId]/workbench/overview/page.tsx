import { ErrorState } from "@/components/page-states";
import { ProjectForm } from "@/components/project-form";
import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const outcome = await getProjectRepository().getById(projectId).then((project) => ({ project, error: null })).catch((error: unknown) => ({ project: null, error }));
  if (!outcome.project) {
    const code = outcome.error instanceof ProjectRepositoryError ? outcome.error.code : "PROJECT_READ_FAILED";
    const title = code === "PROJECT_NOT_FOUND" ? "项目不存在" : code === "PROJECT_ID_INVALID" ? "项目标识无效" : "项目读取失败";
    return <ErrorState title={title} description="无法读取该项目的有效数据。请返回项目库或检查本地项目JSON后重试。" />;
  }
  const project = outcome.project;
  return <div className="overview"><p className="eyebrow">项目总览</p><h1>{project.name}</h1><p className="lead">{project.projectType}</p><section className="grid-two"><article className="info-card"><h2>项目基本信息</h2><dl><dt>项目标识</dt><dd>{project.projectId}</dd><dt>Schema版本</dt><dd>v{project.schemaVersion}</dd><dt>最后更新</dt><dd>{new Date(project.updatedAt).toLocaleString("zh-CN")}</dd></dl></article><ProjectForm mode="edit" project={project} /></section><section className="info-card"><h2>编制进度</h2><p>该区域为静态页面骨架，不预设任何通用章节目录或业务状态。</p></section></div>;
}
