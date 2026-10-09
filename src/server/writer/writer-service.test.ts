import { describe, expect, it } from "vitest";
import { demoProject } from "@/domain/projects/demo-project";
import type { ProjectDocument } from "@/domain/projects/schema";
import { MockWriterProvider } from "@/server/writer/model-provider";
import { WriterService } from "@/server/writer/writer-service";

const nodeBase = { purpose: "形成发展策略", keyPoints: ["问题—目标—策略—措施"], requiredMaterials: [], prerequisiteNodeIds: [], prerequisiteNotes: [], estimatedLengthChars: 1000, generationBasis: [] };
const section = { ...nodeBase, nodeId: "sec_strategy", title: "发展策略", writerType: "strategy_solution" as const };
const chapter = { ...nodeBase, nodeId: "ch_strategy", title: "总体策略", sections: [section] };
const project: ProjectDocument = { ...demoProject, plannerOutline: { ...demoProject.plannerOutline, confirmedVersions: [{ version: 1, basedOnWorkingRevision: 1, basedOnGenerationId: null, confirmedAt: "2026-07-30T00:00:00.000Z", content: { contractVersion: 1 as const, outlineTitle: "测试目录", chapters: [chapter], missingMaterials: [], professionalConfirmations: [] } }], activeConfirmedVersion: 1 } };

describe("WriterService", () => {
  it("uses a mock provider and only saves latestSuggestion", async () => {
    let saved: unknown;
    const provider = new MockWriterProvider(() => ({ rawText: JSON.stringify({ chapterNodeId: "ch_strategy", sectionNodeId: "sec_strategy", sectionTitle: "发展策略", contentMarkdown: "围绕问题、目标、策略和措施形成当前子节正文。", strategyMapping: [{ problem: "问题", evidence: ["mat_project_context"], strategy: "策略", measures: ["措施"] }], sourceUsed: ["mat_project_context"], missingInfo: [], humanConfirmation: [], sectionSummary: "当前策略子节摘要。" }), providerResponseId: "resp_1", resolvedModel: "mock-model", tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }));
    const service = new WriterService({ getById: async () => project, saveSectionSuggestion: async (_projectId, _chapterId, _sectionId, suggestion) => { saved = suggestion; return suggestion; } }, provider, "mock-model");
    const suggestion = await service.generateLatestSuggestion("a-village", "ch_strategy", "sec_strategy");
    expect(provider.calls).toBe(1); expect(suggestion.content.sectionNodeId).toBe("sec_strategy"); expect(saved).toEqual(suggestion);
  });
  it("rejects invalid output without saving", async () => {
    const provider = new MockWriterProvider(() => ({ rawText: "{}", providerResponseId: null, resolvedModel: "mock-model", tokenUsage: { inputTokens: null, outputTokens: null, totalTokens: null } }));
    const service = new WriterService({ getById: async () => project, saveSectionSuggestion: async () => { throw new Error("must not save"); } }, provider, "mock-model");
    await expect(service.generateLatestSuggestion("a-village", "ch_strategy", "sec_strategy")).rejects.toMatchObject({ code: "WRITER_OUTPUT_INVALID" });
  });

  it("uses the confirmed fact_analysis type and does not require strategyMapping", async () => {
    const factProject = structuredClone(project);
    factProject.plannerOutline.confirmedVersions[0].content.chapters[0].sections[0].writerType = "fact_analysis";
    const provider = new MockWriterProvider((request) => {
      expect(request.prompt).toContain("负责撰写事实归纳、项目概况和现状分析类章节");
      return {
        rawText: JSON.stringify({
          chapterNodeId: "ch_strategy",
          sectionNodeId: "sec_strategy",
          sectionTitle: "发展策略",
          contentMarkdown: "基于项目资料归纳当前事实。",
          strategyMapping: [],
          sourceUsed: ["mat_project_context"],
          missingInfo: [],
          humanConfirmation: [],
          sectionSummary: "当前事实摘要。",
        }),
        providerResponseId: "resp_fact",
        resolvedModel: "mock-model",
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    });
    const service = new WriterService({
      getById: async () => factProject,
      saveSectionSuggestion: async (_projectId, _chapterId, _sectionId, suggestion) => suggestion,
    }, provider, "mock-model");

    await expect(service.generateLatestSuggestion("a-village", "ch_strategy", "sec_strategy"))
      .resolves.toMatchObject({
        promptSource: "docs/prompts/writer/fact-analysis-writer-prompt-v1.md",
        content: { strategyMapping: [] },
      });
  });
});
