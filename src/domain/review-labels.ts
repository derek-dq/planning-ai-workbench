import type { ReviewDimension, ReviewIssueType } from "@/server/reviewer/contracts";

export const REVIEW_DIMENSION_LABELS: Record<ReviewDimension, string> = {
  structure_format: "结构与格式",
  content_coverage: "内容覆盖",
  facts_evidence: "事实与依据",
  coherence: "前后衔接",
  professional_expression: "专业表达",
};

export const REVIEW_ISSUE_TYPE_LABELS: Record<ReviewIssueType, string> = {
  must_fix: "必须处理",
  suggestion: "建议优化",
  professional_confirmation: "待专业确认",
};
