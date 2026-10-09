import {
  getProjectRepository,
  ProjectRepositoryError,
} from "@/server/projects/project-repository";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { projectId, chapterId, sectionId } = await params;
  try {
    const body: unknown = await request.json();
    return Response.json(await getProjectRepository().updateSectionDependency(
      projectId,
      chapterId,
      sectionId,
      body,
    ));
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "SECTION_DEPENDENCY_INVALID";
    const status = code === "PROJECT_NOT_FOUND" || code === "SECTION_TARGET_NOT_FOUND" ? 404 : 422;
    return Response.json({ error: code }, { status });
  }
}
