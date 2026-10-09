import { describe, expect, it } from "vitest";

import type { WriterInput } from "@/server/writer/contracts";
import { buildWriterRuntimePromptFromSource } from "@/server/writer/runtime-prompt";

const input: WriterInput = {
  confirmedOutlineVersion: 1,
  project: { projectId: "project_01", name: "测试项目", projectType: "咨询" },
  target: {
    chapterNodeId: "chapter_01",
    sectionNodeId: "section_01",
    sectionTitle: "发展策略",
    writerType: "strategy_solution",
    writingFocus: ["提出可执行策略"],
    requiredMaterials: ["material_01"],
  },
  adoptedMaterials: [{ materialId: "material_01", title: "项目资料", category: "project_context", summary: "已确认事实" }],
  knownMissingMaterials: [],
  pendingProfessionalConfirmations: [],
  userNotes: [],
  predecessorContext: null,
};

describe("buildWriterRuntimePromptFromSource", () => {
  it("removes legacy snake_case examples and supplies the runtime camelCase contract", () => {
    const runtime = buildWriterRuntimePromptFromSource(`
# Role
按资料编写当前子节。
# Examples
{ "chapter_id": "legacy", "strategy_mapping": [] }
# Output
{ "content_markdown": "legacy" }
`, input);

    expect(runtime.prompt).toContain('"chapterNodeId": "chapter_01"');
    expect(runtime.prompt).toContain('"strategyMapping"');
    expect(runtime.prompt).toContain("不得使用旧示例中的 snake_case 字段名");
    expect(runtime.prompt).not.toContain('"chapter_id": "legacy"');
    expect(runtime.prompt).not.toContain('"content_markdown": "legacy"');
  });
});
