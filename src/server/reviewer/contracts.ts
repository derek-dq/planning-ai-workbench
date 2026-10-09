import { createHash } from "node:crypto";

import {
  validateWriterSuggestion,
  type WriterContent,
  type WriterSuggestion,
  type WriterTokenUsage,
} from "@/server/writer/contracts";
import type { SectionDependencySnapshot } from "@/domain/projects/schema";

export const REVIEWER_OUTPUT_CONTRACT_VERSION = 1 as const;

export const REVIEW_DIMENSIONS = [
  "structure_format",
  "content_coverage",
  "facts_evidence",
  "coherence",
  "professional_expression",
] as const;

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];
export type ReviewIssueType = "must_fix" | "suggestion" | "professional_confirmation";
export type ReviewIssueStatus = "open" | "resolved" | "accepted" | "manual_required";

export { REVIEW_DIMENSION_LABELS, REVIEW_ISSUE_TYPE_LABELS } from "@/domain/review-labels";

export type ReviewerInput = {
  project: { projectId: string; name: string; projectType: string };
  activeConfirmedVersion: number;
  target: {
    chapterId: string;
    chapterTitle: string;
    sectionId: string;
    sectionTitle: string;
    purpose: string;
    writingFocus: string[];
  };
  savedDraft: WriterContent & { revision: number };
  sourceFingerprint: string;
  adoptedFacts: Array<{ materialId: string; title: string; category: string; summary: string }>;
  referenceOnlyMaterials: Array<{ materialId: string; title: string; summary: string }>;
  confirmedProjectConstraints: string[];
  previousConfirmedSummaries: string[];
  reviewCriteria: string[];
};

export type ReviewDimensionResult = {
  dimension: ReviewDimension;
  status: "pass" | "warning" | "fail";
  summary: string;
};

export type ReviewerOutputIssue = {
  dimension: ReviewDimension;
  type: ReviewIssueType;
  location: string;
  problem: string;
  evidence: string;
  impact: string;
  suggestion: string;
};

export type ReviewerOutput = {
  reviewResult: "pass" | "revise";
  dimensionResults: ReviewDimensionResult[];
  issues: ReviewerOutputIssue[];
  reviewSummary: string;
};

export type ReviewIssue = ReviewerOutputIssue & {
  issueId: string;
  issueSignature: string;
};

export type ReviewerCallMetadata = {
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  providerResponseId: string | null;
  promptVersion: string;
  inputFingerprint: string;
  tokenUsage: WriterTokenUsage;
  latencyMs: number;
  attemptCount: number;
  startedAt: string;
  completedAt: string;
};

export type ReviewRun = {
  reviewId: string;
  projectId: string;
  chapterId: string;
  sectionId: string;
  sourceDraftRevision: number;
  sourceFingerprint: string;
  reviewResult: "pass" | "revise";
  dimensionResults: ReviewDimensionResult[];
  issues: ReviewIssue[];
  reviewSummary: string;
  callMetadata: ReviewerCallMetadata;
  createdAt: string;
};

export type ReviewIssueState = {
  issueId: string;
  status: ReviewIssueStatus;
  autoRevisionAttemptCount: number;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export type ReviewRevisionSuggestion = {
  issueId: string;
  sourceReviewId: string;
  sourceDraftRevision: number;
  sourceFingerprint: string;
  suggestion: WriterSuggestion;
  createdAt: string;
};

export type ProfessionalTask = {
  taskId: string;
  issueId: string;
  title: string;
  status: "open";
  createdAt: string;
};

export type SectionConfirmation = {
  confirmationId: string;
  reviewId: string;
  draftRevision: number;
  sourceFingerprint: string;
  version: number;
  confirmedAt: string;
};

export type SectionReviewDocument = {
  target: {
    confirmedOutlineVersion: number;
    chapterId: string;
    sectionId: string;
    sectionTitle: string;
  };
  runs: ReviewRun[];
  issueStates: Record<string, ReviewIssueState>;
  revisionSuggestions: Record<string, ReviewRevisionSuggestion>;
  professionalTasks: ProfessionalTask[];
  confirmations: SectionConfirmation[];
};

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = 50000): value is string => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isIso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const isInteger = (value: unknown, min = 0): value is number => typeof value === "number" && Number.isInteger(value) && value >= min;
const isDimension = (value: unknown): value is ReviewDimension => REVIEW_DIMENSIONS.includes(value as ReviewDimension);
const isIssueType = (value: unknown): value is ReviewIssueType => value === "must_fix" || value === "suggestion" || value === "professional_confirmation";

export function createReviewInputFingerprint(input: ReviewerInput): string {
  return createHash("sha256").update(stableStringify(input), "utf8").digest("hex");
}

export function createDraftFingerprint(
  draft: WriterContent & { revision: number },
  target: SectionReviewDocument["target"],
  dependencySnapshot?: SectionDependencySnapshot | null,
): string {
  const normalizedDraft = {
    chapterNodeId: draft.chapterNodeId,
    sectionNodeId: draft.sectionNodeId,
    sectionTitle: draft.sectionTitle,
    contentMarkdown: draft.contentMarkdown,
    strategyMapping: draft.strategyMapping,
    sourceUsed: draft.sourceUsed,
    missingInfo: draft.missingInfo,
    humanConfirmation: draft.humanConfirmation,
    sectionSummary: draft.sectionSummary,
    revision: draft.revision,
  };
  const value = dependencySnapshot
    ? { target, draft: normalizedDraft, dependencySnapshot }
    : { target, draft: normalizedDraft };
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export function createIssueSignature(issue: ReviewerOutputIssue): string {
  const normalized = {
    dimension: issue.dimension,
    type: issue.type,
    location: issue.location.trim().toLowerCase().replace(/\s+/g, " "),
    problem: issue.problem.trim().toLowerCase().replace(/\s+/g, " "),
  };
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

export function validateReviewerOutput(value: unknown): { ok: true; value: ReviewerOutput } | { ok: false; error: "REVIEWER_OUTPUT_INVALID" } {
  if (!isRecord(value) || (value.reviewResult !== "pass" && value.reviewResult !== "revise")
    || !Array.isArray(value.dimensionResults) || value.dimensionResults.length !== REVIEW_DIMENSIONS.length
    || !Array.isArray(value.issues) || value.issues.length > 100 || !isText(value.reviewSummary, 4000)) {
    return { ok: false, error: "REVIEWER_OUTPUT_INVALID" };
  }

  const dimensions = value.dimensionResults.map(parseDimensionResult);
  if (dimensions.some((item) => item === null)
    || new Set(dimensions.map((item) => item?.dimension)).size !== REVIEW_DIMENSIONS.length
    || REVIEW_DIMENSIONS.some((dimension) => !dimensions.some((item) => item?.dimension === dimension))) {
    return { ok: false, error: "REVIEWER_OUTPUT_INVALID" };
  }

  const issues = value.issues.map(parseOutputIssue);
  if (issues.some((item) => item === null)) return { ok: false, error: "REVIEWER_OUTPUT_INVALID" };
  const validIssues = issues as ReviewerOutputIssue[];
  const hasMustFix = validIssues.some((item) => item.type === "must_fix");
  if ((value.reviewResult === "pass" && hasMustFix) || (value.reviewResult === "revise" && !hasMustFix)) {
    return { ok: false, error: "REVIEWER_OUTPUT_INVALID" };
  }

  return {
    ok: true,
    value: {
      reviewResult: value.reviewResult,
      dimensionResults: dimensions as ReviewDimensionResult[],
      issues: validIssues,
      reviewSummary: value.reviewSummary.trim(),
    },
  };
}

export function validateSectionReviewDocument(value: unknown, sectionId: string): value is SectionReviewDocument {
  if (!isRecord(value) || !isRecord(value.target) || value.target.sectionId !== sectionId
    || !isInteger(value.target.confirmedOutlineVersion, 1) || !isText(value.target.chapterId, 80)
    || !isText(value.target.sectionTitle, 120) || !Array.isArray(value.runs)
    || !isRecord(value.issueStates) || !isRecord(value.revisionSuggestions)
    || !Array.isArray(value.professionalTasks) || !Array.isArray(value.confirmations)) return false;

  return value.runs.every(validateReviewRun)
    && Object.entries(value.issueStates).every(([issueId, state]) => issueId === (state as RecordValue)?.issueId && validateIssueState(state))
    && Object.entries(value.revisionSuggestions).every(([issueId, suggestion]) => issueId === (suggestion as RecordValue)?.issueId && validateRevisionSuggestion(suggestion))
    && value.professionalTasks.every(validateProfessionalTask)
    && value.confirmations.every(validateConfirmation);
}

function parseDimensionResult(value: unknown): ReviewDimensionResult | null {
  if (!isRecord(value) || !isDimension(value.dimension)
    || (value.status !== "pass" && value.status !== "warning" && value.status !== "fail")
    || !isText(value.summary, 2000)) return null;
  return { dimension: value.dimension, status: value.status, summary: value.summary.trim() };
}

function parseOutputIssue(value: unknown): ReviewerOutputIssue | null {
  if (!isRecord(value) || !isDimension(value.dimension) || !isIssueType(value.type)
    || !isText(value.location, 1000) || !isText(value.problem, 4000) || !isText(value.evidence, 4000)
    || !isText(value.impact, 4000) || !isText(value.suggestion, 4000)) return null;
  return {
    dimension: value.dimension,
    type: value.type,
    location: value.location.trim(),
    problem: value.problem.trim(),
    evidence: value.evidence.trim(),
    impact: value.impact.trim(),
    suggestion: value.suggestion.trim(),
  };
}

function validateReviewRun(value: unknown): value is ReviewRun {
  if (!isRecord(value) || !isText(value.reviewId, 120) || !isText(value.projectId, 120)
    || !isText(value.chapterId, 80) || !isText(value.sectionId, 80) || !isInteger(value.sourceDraftRevision, 1)
    || !isHash(value.sourceFingerprint) || !isIso(value.createdAt) || !isRecord(value.callMetadata)
    || !Array.isArray(value.dimensionResults) || !Array.isArray(value.issues)) return false;
  const output = validateReviewerOutput({
    reviewResult: value.reviewResult,
    dimensionResults: value.dimensionResults,
    issues: value.issues,
    reviewSummary: value.reviewSummary,
  });
  return output.ok && value.issues.every((issue) => isRecord(issue) && isText(issue.issueId, 120) && isHash(issue.issueSignature))
    && validateCallMetadata(value.callMetadata);
}

function validateCallMetadata(value: RecordValue): boolean {
  return isText(value.provider, 120) && isText(value.requestedModel, 120) && isText(value.resolvedModel, 120)
    && (value.providerResponseId === null || isText(value.providerResponseId, 200))
    && isText(value.promptVersion, 120) && isHash(value.inputFingerprint)
    && isRecord(value.tokenUsage) && [value.tokenUsage.inputTokens, value.tokenUsage.outputTokens, value.tokenUsage.totalTokens].every((token) => token === null || isInteger(token))
    && isInteger(value.latencyMs) && isInteger(value.attemptCount, 1) && value.attemptCount <= 2
    && isIso(value.startedAt) && isIso(value.completedAt);
}

function validateIssueState(value: unknown): value is ReviewIssueState {
  return isRecord(value) && isText(value.issueId, 120)
    && (value.status === "open" || value.status === "resolved" || value.status === "accepted" || value.status === "manual_required")
    && isInteger(value.autoRevisionAttemptCount) && value.autoRevisionAttemptCount <= 2
    && (value.resolvedAt === null || isIso(value.resolvedAt))
    && (value.resolutionNote === null || isText(value.resolutionNote, 4000));
}

function validateRevisionSuggestion(value: unknown): value is ReviewRevisionSuggestion {
  if (!isRecord(value) || !isText(value.issueId, 120) || !isText(value.sourceReviewId, 120)
    || !isInteger(value.sourceDraftRevision, 1) || !isHash(value.sourceFingerprint)
    || !isIso(value.createdAt)) return false;
  return validateWriterSuggestion(value.suggestion);
}

function validateProfessionalTask(value: unknown): value is ProfessionalTask {
  return isRecord(value) && isText(value.taskId, 120) && isText(value.issueId, 120)
    && isText(value.title, 1000) && value.status === "open" && isIso(value.createdAt);
}

function validateConfirmation(value: unknown): value is SectionConfirmation {
  return isRecord(value) && isText(value.confirmationId, 120) && isText(value.reviewId, 120)
    && isInteger(value.draftRevision, 1) && isHash(value.sourceFingerprint)
    && isInteger(value.version, 1) && isIso(value.confirmedAt);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
