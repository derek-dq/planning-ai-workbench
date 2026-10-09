import { NextResponse } from "next/server";

import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

function statusFor(code: string): number {
  if (code === "PROJECT_NOT_FOUND" || code === "OUTLINE_NOT_FOUND") return 404;
  if (code === "PROJECT_ID_INVALID" || code === "OUTLINE_VALIDATION_FAILED") return 400;
  if (code === "OUTLINE_CONFIRM_CONFLICT") return 409;
  return 500;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    return NextResponse.json(await getProjectRepository().confirmWorkingOutline(projectId, await request.json()));
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "OUTLINE_WRITE_FAILED";
    return NextResponse.json({ code }, { status: statusFor(code) });
  }
}
