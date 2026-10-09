import {
  getProjectRepository,
  ProjectRepositoryError,
} from "@/server/projects/project-repository";
import { buildDeliverablesSummary } from "@/server/deliverables/summary";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(_: Request, { params }: Context) {
  const { projectId } = await params;
  try {
    const project = await getProjectRepository().getById(projectId);
    const summary = buildDeliverablesSummary(project);
    if (summary.exportableSections.length === 0) {
      return Response.json({ error: "NO_CONFIRMED_CONTENT" }, { status: 422 });
    }
    return Response.json({
      error: "WORD_EXPORT_UNAVAILABLE",
      message: "当前环境暂不支持导出。",
    }, { status: 503 });
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "PROJECT_READ_FAILED";
    return Response.json({ error: code }, { status: code === "PROJECT_NOT_FOUND" ? 404 : 500 });
  }
}
