import { getProjectRepository, ProjectRepositoryError } from "@/server/projects/project-repository";
import { ReviewRevisionError, ReviewRevisionService } from "@/server/reviewer/revision-service";
import {
  createDeepSeekWriterProviderFromEnvironment,
  getConfiguredWriterModel,
} from "@/server/writer/model-provider";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string; issueId: string }> };

export async function POST(_: Request, { params }: Context) {
  const { projectId, chapterId, sectionId, issueId } = await params;
  try {
    const service = new ReviewRevisionService(
      getProjectRepository(),
      createDeepSeekWriterProviderFromEnvironment(),
      getConfiguredWriterModel(),
    );
    return Response.json(await service.generate(projectId, chapterId, sectionId, issueId));
  } catch (error) {
    const code = error instanceof ReviewRevisionError || error instanceof ProjectRepositoryError
      ? error.code
      : "WRITER_PROVIDER_FAILED";
    const status = code === "REVIEW_ISSUE_NOT_FOUND" ? 404
      : code === "SECTION_REVIEW_STALE" || code === "REVIEW_ISSUE_ATTEMPTS_EXHAUSTED" ? 409
        : code === "WRITER_INPUT_INSUFFICIENT" || code === "WRITER_NOT_CONFIGURED" ? 422 : 500;
    return Response.json({ error: code }, { status });
  }
}

export async function PUT(request: Request, { params }: Context) {
  const { projectId, chapterId, sectionId, issueId } = await params;
  try {
    return Response.json(await getProjectRepository().applyReviewRevisionSuggestion(
      projectId,
      chapterId,
      sectionId,
      issueId,
      await request.json(),
    ));
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "SECTION_REVIEW_WRITE_FAILED";
    const status = code === "REVIEW_REVISION_NOT_FOUND" ? 404
      : code === "SECTION_REVIEW_STALE" || code === "SECTION_DRAFT_CONFLICT" ? 409 : 500;
    return Response.json({ error: code }, { status });
  }
}
