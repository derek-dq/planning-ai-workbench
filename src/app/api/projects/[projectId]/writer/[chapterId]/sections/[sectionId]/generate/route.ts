import { getConfiguredWriterModel, createDeepSeekWriterProviderFromEnvironment } from "@/server/writer/model-provider";
import { WriterGenerationError, WriterService } from "@/server/writer/writer-service";
import { getProjectRepository, ProjectRepositoryError } from "@/server/projects/project-repository";

type Context = { params: Promise<{ projectId: string; chapterId: string; sectionId: string }> };
function status(code: string) { if (["PROJECT_NOT_FOUND", "SECTION_TARGET_NOT_FOUND", "WRITER_TARGET_NOT_FOUND"].includes(code)) return 404; if (["WRITER_INPUT_INSUFFICIENT", "WRITER_DEPENDENCY_UNMET", "WRITER_NOT_CONFIGURED"].includes(code)) return 422; return 500; }

export async function POST(_: Request, { params }: Context) {
  const { projectId, chapterId, sectionId } = await params;
  try {
    const service = new WriterService(getProjectRepository(), createDeepSeekWriterProviderFromEnvironment(), getConfiguredWriterModel());
    return Response.json(await service.generateLatestSuggestion(projectId, chapterId, sectionId));
  } catch (error) {
    const code = error instanceof WriterGenerationError || error instanceof ProjectRepositoryError ? error.code : "WRITER_PROVIDER_FAILED";
    return Response.json({ error: code }, { status: status(code) });
  }
}
