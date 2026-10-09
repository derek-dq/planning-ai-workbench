import { DeliverablesOverview } from "@/components/deliverables-overview";
import { ErrorState } from "@/components/page-states";
import { buildDeliverablesSummary } from "@/server/deliverables/summary";
import { getProjectRepository } from "@/server/projects/project-repository";

export const dynamic = "force-dynamic";

export default async function DeliverablesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProjectRepository().getById(projectId).catch(() => null);
  if (!project) return <ErrorState title="成果与版本读取失败" description="当前项目数据无法读取，请返回项目库后重试。" />;
  return <DeliverablesOverview summary={buildDeliverablesSummary(project)} />;
}
