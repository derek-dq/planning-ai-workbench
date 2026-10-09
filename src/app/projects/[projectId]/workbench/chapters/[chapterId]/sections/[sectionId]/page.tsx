import { SectionDraftEditor } from "@/components/section-draft-editor";
import { ErrorState } from "@/components/page-states";
import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

export const dynamic = "force-dynamic";
export default async function ChapterPage({ params }: { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> }) {
  const { projectId, chapterId, sectionId } = await params;
  const outcome = await getProjectRepository().getSectionDraft(projectId, chapterId, sectionId)
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error }));
  if (!outcome.data) {
    const code = outcome.error instanceof ProjectRepositoryError ? outcome.error.code : "PROJECT_READ_FAILED";
    return <ErrorState title={code === "SECTION_TARGET_NOT_FOUND" ? "请先选择已确认的策略型子节" : "章节编制读取失败"} description={code === "SECTION_TARGET_NOT_FOUND" ? "Writer 只读取活动确认版本中的子节。请返回方案结构新增或指定目标。" : "当前子节资料无法读取，请返回方案结构后重试。"} />;
  }
  const project = await getProjectRepository().getById(projectId);
  return <SectionDraftEditor projectId={projectId} chapterId={chapterId} sectionId={sectionId} task={outcome.data.task} materials={outcome.data.materials} initialDraft={outcome.data.draft} outline={project.plannerOutline} initialDependency={outcome.data.dependency} />;
}
