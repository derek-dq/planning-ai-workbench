import { getProjectRepository, ProjectRepositoryError } from "@/server/projects/project-repository";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> };

export async function POST(_: Request, { params }: Context) {
  const { projectId, chapterId, sectionId } = await params;
  try {
    return Response.json(await getProjectRepository().confirmReviewedSection(projectId, chapterId, sectionId));
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "SECTION_REVIEW_WRITE_FAILED";
    const status = code === "SECTION_REVIEW_STALE" || code === "SECTION_REVIEW_BLOCKED" ? 409
      : code === "SECTION_REVIEW_NOT_FOUND" ? 404 : 500;
    return Response.json({ error: code }, { status });
  }
}
