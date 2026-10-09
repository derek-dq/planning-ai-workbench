import { NextResponse } from "next/server";
import { ProjectRepositoryError, getProjectRepository } from "@/server/projects/project-repository";

export async function GET() {
  try {
    return NextResponse.json(await getProjectRepository().list());
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "PROJECT_READ_FAILED";
    return NextResponse.json({ code }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await getProjectRepository().create(await request.json()), { status: 201 });
  } catch (error) {
    const code = error instanceof ProjectRepositoryError ? error.code : "PROJECT_VALIDATION_FAILED";
    return NextResponse.json({ code }, { status: code === "PROJECT_VALIDATION_FAILED" ? 400 : 500 });
  }
}
