import { NextResponse } from "next/server";

import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; materialId: string }> },
) {
  try {
    const { projectId, materialId } = await params;
    return NextResponse.json(
      await getProjectRepository().updateMaterialUsage(projectId, materialId, await request.json()),
    );
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "MATERIAL_VALIDATION_FAILED";
    const status = code === "PROJECT_NOT_FOUND" || code === "MATERIAL_NOT_FOUND"
      ? 404
      : code === "PROJECT_ID_INVALID" || code === "MATERIAL_VALIDATION_FAILED"
        ? 400
        : 500;
    return NextResponse.json({ code }, { status });
  }
}
