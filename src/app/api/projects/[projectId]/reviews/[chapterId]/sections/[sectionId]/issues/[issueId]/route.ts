import { getProjectRepository, ProjectRepositoryError } from "@/server/projects/project-repository";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string; issueId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { projectId, chapterId, sectionId, issueId } = await params;
  try {
    return Response.json(await getProjectRepository().updateReviewIssue(
      projectId,
      chapterId,
      sectionId,
      issueId,
      await request.json(),
    ));
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "SECTION_REVIEW_WRITE_FAILED";
    const status = code === "REVIEW_ISSUE_NOT_FOUND" ? 404
      : code === "SECTION_REVIEW_STALE" || code === "SECTION_REVIEW_BLOCKED" ? 409
        : code === "SECTION_REVIEW_VALIDATION_FAILED" ? 400 : 500;
    return Response.json({ error: code }, { status });
  }
}
