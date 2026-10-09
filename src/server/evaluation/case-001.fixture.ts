import { demoProject } from "@/domain/projects/demo-project";
import type { ProjectDocument } from "@/domain/projects/schema";

export const CASE_001_PROJECT_ID = "case_001";
export const CASE_001_TIMESTAMP = "2026-08-04T08:00:00.000Z";

const materialBase = {
  sourceKind: "redacted_case" as const,
  materialParseStatus: "parsed" as const,
  materialVersionStatus: "current" as const,
  professionalConfirmationStatus: "not_required" as const,
  updatedAt: CASE_001_TIMESTAMP,
};

export function createCase001Project(): ProjectDocument {
  const project = structuredClone(demoProject);
  project.projectId = CASE_001_PROJECT_ID;
  project.name = "资料型方案编制脱敏案例";
  project.projectType = "存量空间综合提升方案";
  project.createdAt = CASE_001_TIMESTAMP;
  project.updatedAt = CASE_001_TIMESTAMP;
  project.materials = [
    {
      ...materialBase,
      materialId: "mat_case_context",
      title: "项目背景",
      category: "project_context",
      materialUsageStatus: "adopted",
      summary: "某存量建成区综合提升项目，需在既有设施、现状条件和多方意见基础上形成可审阅的技术方案；未确认的新增建设条件不得写成既定事实。",
    },
    {
      ...materialBase,
      materialId: "mat_case_deliverables",
      title: "成果要求",
      category: "deliverable_requirements",
      materialUsageStatus: "adopted",
      summary: "成果应覆盖项目概况、发展研判、空间与建设安排、行动计划；目录完整，章节范围、对象和措施口径一致。",
    },
    {
      ...materialBase,
      materialId: "mat_case_revision",
      title: "最新修改纪要",
      category: "task_requirements",
      materialUsageStatus: "adopted",
      summary: "核实项目范围；删除缺乏依据的产业假设；既有公共服务设施能够满足需求时优先评估利用而非新增独立设施；建设点位须与现状条件一致；项目清单与图文表达需同步调整。",
    },
    {
      ...materialBase,
      materialId: "mat_case_criteria",
      title: "验收口径",
      category: "evaluation_criteria",
      materialUsageStatus: "adopted",
      summary: "初步交付至少满足事实有来源、章节前后一致、框架完整；关键结论可追溯至输入材料或标记为待人工确认。",
    },
    {
      ...materialBase,
      materialId: "mat_case_reference",
      title: "参考结构",
      category: "reference_template",
      materialUsageStatus: "reference_only",
      summary: "可参考背景、研判、策略、建设安排、行动计划的结构组织方式；不得复制参考项目事实。",
    },
  ];
  return project;
}
