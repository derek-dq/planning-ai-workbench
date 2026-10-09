import Link from "next/link";

import { EmptyState, ErrorState } from "@/components/page-states";
import { ProjectForm } from "@/components/project-form";
import { ProjectRepositoryError, getProjectRepository, type ProjectListResult } from "@/server/projects/project-repository";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const outcome: { result: ProjectListResult | null; error: unknown } = await getProjectRepository().list().then((result) => ({ result, error: null })).catch((error: unknown) => ({ result: null, error }));
  if (outcome.error || !outcome.result) {
    const message = outcome.error instanceof ProjectRepositoryError && outcome.error.code === "PROJECT_SEED_FAILED" ? "演示项目初始化失败，请检查本地数据目录后重试。" : "项目数据暂时无法读取，请检查本地数据目录后重试。";
    return <div className="content-page"><ErrorState title="项目库读取失败" description={message} /></div>;
  }
  const { projects, issues } = outcome.result;
  return <div className="content-page projects-page"><header className="page-header"><div><p className="eyebrow">项目库</p><h1>项目总览</h1><p>集中管理方案编制项目，查看进度并进入项目工作台。</p></div></header><ProjectForm mode="create" />{issues.length > 0 && <ErrorState title="部分项目无法读取" description="其他有效项目仍可使用。请检查损坏或不兼容的项目数据后重试。" />}{projects.length === 0 && issues.length === 0 ? <EmptyState title="暂无项目" description="当前没有可读取的项目。" /> : <section className="table-card project-table" aria-label="项目列表"><div className="project-row project-head"><span>项目名称</span><span>项目类型</span><span>最后更新</span><span>操作</span></div>{projects.map((project) => <div className="project-row" key={project.projectId}><strong>{project.name}</strong><span data-label="项目类型">{project.projectType}</span><span data-label="最后更新">{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(project.updatedAt))}</span><Link href={`/projects/${project.projectId}/workbench/overview`}>打开项目 <span aria-hidden="true">→</span></Link></div>)}</section>}</div>;
}
