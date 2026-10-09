import { ErrorState } from "@/components/page-states";
import { SectionReviewWorkbench } from "@/components/section-review-workbench";
import { getProjectRepository, ProjectRepositoryError } from "@/server/projects/project-repository";

export const dynamic = "force-dynamic";

export default async function ReviewsPage({ params }: { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> }) {
  const { projectId, chapterId, sectionId } = await params;
  const outcome = await getProjectRepository().getSectionReview(projectId, chapterId, sectionId)
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error }));
  if (!outcome.data) {
    const code = outcome.error instanceof ProjectRepositoryError ? outcome.error.code : "PROJECT_READ_FAILED";
    return <ErrorState title={code === "SECTION_TARGET_NOT_FOUND" ? "当前子节不在确认目录中" : "内容校核读取失败"} description="请返回方案结构或章节编制页核对当前子节后重试。" />;
  }
  const active = outcome.data.project.plannerOutline.confirmedVersions
    .find((version) => version.version === outcome.data.project.plannerOutline.activeConfirmedVersion)?.content;
  const chapterTitle = active?.chapters.find((chapter) => chapter.nodeId === chapterId)?.title ?? chapterId;
  return <SectionReviewWorkbench
    projectId={projectId}
    chapterId={chapterId}
    chapterTitle={chapterTitle}
    sectionId={sectionId}
    task={outcome.data.task}
    draft={outcome.data.draft}
    review={outcome.data.review}
    latestRun={outcome.data.latestRun}
    isLatestReviewCurrent={outcome.data.isLatestReviewCurrent}
    dependency={outcome.data.dependency}
  />;
}
