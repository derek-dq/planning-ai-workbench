import { NextResponse } from "next/server";

import {
  createDeepSeekPlannerProviderFromEnvironment,
  getConfiguredPlannerModel,
} from "@/server/planner/model-provider";
import {
  PlannerGenerationError,
  PlannerOutlineService,
} from "@/server/planner/planner-service";
import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

function errorStatus(code: string): number {
  if (code === "PROJECT_NOT_FOUND") return 404;
  if (code === "PROJECT_ID_INVALID") return 400;
  if (code === "PLANNER_INPUT_INSUFFICIENT") return 422;
  if (code === "PLANNER_NOT_CONFIGURED") return 503;
  if (code === "PLANNER_RATE_LIMITED") return 429;
  if (code === "PLANNER_TIMEOUT") return 504;
  return 500;
}

export async function POST(
  _: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  try {
    const service = new PlannerOutlineService(
      getProjectRepository(),
      createDeepSeekPlannerProviderFromEnvironment(),
      getConfiguredPlannerModel(),
    );
    return NextResponse.json(await service.generateLatestSuggestion(projectId), { status: 201 });
  } catch (error) {
    if (error instanceof PlannerGenerationError) {
      return NextResponse.json({
        code: error.code,
        blockingMissing: error.code === "PLANNER_INPUT_INSUFFICIENT" ? error.blockingMissing : undefined,
      }, { status: errorStatus(error.code) });
    }
    const code = error instanceof ProjectRepositoryError ? error.code : "PROJECT_READ_FAILED";
    return NextResponse.json({ code }, { status: errorStatus(code) });
  }
}
