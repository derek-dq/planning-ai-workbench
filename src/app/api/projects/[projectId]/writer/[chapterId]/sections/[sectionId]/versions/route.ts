import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { projectId, chapterId, sectionId } = await params;
  try {
    return Response.json(await getProjectRepository().createSectionDraftVersion(projectId, chapterId, sectionId, await request.json()));
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "SECTION_DRAFT_WRITE_FAILED";
    const status = code === "PROJECT_NOT_FOUND" || code === "SECTION_TARGET_NOT_FOUND" || code === "SECTION_DRAFT_NOT_FOUND" ? 404 : code === "SECTION_DRAFT_CONFLICT" ? 409 : code === "SECTION_DRAFT_VALIDATION_FAILED" ? 400 : 500;
    return Response.json({ error: code }, { status });
  }
}
