import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> };

function status(code: string) {
  if (code === "PROJECT_NOT_FOUND" || code === "SECTION_TARGET_NOT_FOUND") return 404;
  if (code === "SECTION_DRAFT_CONFLICT") return 409;
  if (code === "SECTION_DRAFT_VALIDATION_FAILED") return 400;
  return 500;
}

export async function PUT(request: Request, { params }: Context) {
  const { projectId, chapterId, sectionId } = await params;
  try {
    const draft = await getProjectRepository().saveSectionDraft(projectId, chapterId, sectionId, await request.json());
    return Response.json(draft);
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "SECTION_DRAFT_WRITE_FAILED";
    return Response.json({ error: code }, { status: status(code) });
  }
}
