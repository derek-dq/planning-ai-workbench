import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDependencyFixtureProject } from "@/server/dependencies/test-fixture";

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
}));

vi.mock("@/server/projects/project-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/projects/project-repository")>();
  return {
    ...original,
    getProjectRepository: () => ({ getById: mocks.getById }),
  };
});

import { POST } from "./route";

describe("deliverables export route", () => {
  beforeEach(() => mocks.getById.mockReset());

  it("blocks export when there is no current confirmed content", async () => {
    mocks.getById.mockResolvedValue(createDependencyFixtureProject({ confirmPredecessor: false }));
    const response = await POST(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "a-village" }),
    });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "NO_CONFIRMED_CONTENT" });
  });

  it("returns the real environment error instead of a fake file response", async () => {
    mocks.getById.mockResolvedValue(createDependencyFixtureProject());
    const response = await POST(new Request("http://localhost/api"), {
      params: Promise.resolve({ projectId: "a-village" }),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "WORD_EXPORT_UNAVAILABLE",
      message: "当前环境暂不支持导出。",
    });
  });
});
