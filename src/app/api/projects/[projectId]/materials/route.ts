import { NextResponse } from "next/server";

import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    return NextResponse.json(await getProjectRepository().getMaterials((await params).projectId));
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "PROJECT_READ_FAILED";
    const status = code === "PROJECT_NOT_FOUND" ? 404 : code === "PROJECT_ID_INVALID" ? 400 : 500;
    return NextResponse.json({ code }, { status });
  }
}
