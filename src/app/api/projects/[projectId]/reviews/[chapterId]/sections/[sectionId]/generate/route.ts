import { getProjectRepository, ProjectRepositoryError } from "@/server/projects/project-repository";
import {
  createDeepSeekReviewerProviderFromEnvironment,
  getConfiguredReviewerModel,
} from "@/server/reviewer/model-provider";
import { ReviewerGenerationError, ReviewerService } from "@/server/reviewer/reviewer-service";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> };

function status(code: string) {
  if (["PROJECT_NOT_FOUND", "SECTION_TARGET_NOT_FOUND", "REVIEWER_TARGET_NOT_FOUND", "REVIEWER_DRAFT_NOT_FOUND"].includes(code)) return 404;
  if (["REVIEWER_DRAFT_EMPTY", "REVIEWER_INPUT_INSUFFICIENT", "REVIEWER_DEPENDENCY_UNMET", "REVIEWER_NOT_CONFIGURED"].includes(code)) return 422;
  return 500;
}

export async function POST(_: Request, { params }: Context) {
  const { projectId, chapterId, sectionId } = await params;
  try {
    const service = new ReviewerService(
      getProjectRepository(),
      createDeepSeekReviewerProviderFromEnvironment(),
      getConfiguredReviewerModel(),
    );
    return Response.json(await service.reviewCurrentDraft(projectId, chapterId, sectionId));
  } catch (error) {
    const code = error instanceof ReviewerGenerationError || error instanceof ProjectRepositoryError
      ? error.code
      : "REVIEWER_PROVIDER_FAILED";
    return Response.json({ error: code }, { status: status(code) });
  }
}
