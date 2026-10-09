import { getProjectRepository, ProjectRepositoryError } from "@/server/projects/project-repository";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> };
export async function POST(request: Request, { params }: Context) {
  const { projectId, chapterId, sectionId } = await params;
  try { return Response.json(await getProjectRepository().applySectionSuggestion(projectId, chapterId, sectionId, await request.json())); }
  catch (error) { const code = error instanceof ProjectRepositoryError ? error.code : "SECTION_DRAFT_WRITE_FAILED"; const status = ["PROJECT_NOT_FOUND", "SECTION_TARGET_NOT_FOUND", "SECTION_DRAFT_NOT_FOUND"].includes(code) ? 404 : code === "SECTION_DRAFT_CONFLICT" ? 409 : code === "SECTION_DRAFT_VALIDATION_FAILED" ? 400 : 500; return Response.json({ error: code }, { status }); }
}
