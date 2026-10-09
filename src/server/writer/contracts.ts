import { createHash } from "node:crypto";
import type { WriterType } from "@/domain/writer/writer-types";

export const WRITER_OUTPUT_CONTRACT_VERSION = 1 as const;

export type WriterTokenUsage = { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
export type WriterStrategyMapping = { problem: string; evidence: string[]; strategy: string; measures: string[] };
export type WriterContent = {
  chapterNodeId: string;
  sectionNodeId: string;
  sectionTitle: string;
  contentMarkdown: string;
  strategyMapping: WriterStrategyMapping[];
  sourceUsed: string[];
  missingInfo: string[];
  humanConfirmation: string[];
  sectionSummary: string;
};

export type WriterSuggestion = {
  generationId: string;
  generationRequestId: string;
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  providerResponseId: string | null;
  promptVersion: string;
  promptSource: string;
  parentPromptVersion: string;
  contentHash: string;
  contractVersion: typeof WRITER_OUTPUT_CONTRACT_VERSION;
  inputFingerprint: string;
  tokenUsage: WriterTokenUsage;
  latencyMs: number;
  attemptCount: number;
  startedAt: string;
  completedAt: string;
  generatedAt: string;
  content: WriterContent;
};

export type WriterInput = {
  confirmedOutlineVersion: number;
  project: { projectId: string; name: string; projectType: string };
  target: {
    chapterNodeId: string;
    sectionNodeId: string;
    sectionTitle: string;
    writerType: WriterType;
    writingFocus: string[];
    requiredMaterials: string[];
  };
  adoptedMaterials: Array<{ materialId: string; title: string; category: string; summary: string }>;
  knownMissingMaterials: string[];
  pendingProfessionalConfirmations: string[];
  userNotes: string[];
  predecessorContext: {
    basis: "confirmed" | "provisional";
    chapterId: string;
    sectionId: string;
    sectionTitle: string;
    confirmationId: string;
    confirmedAt: string;
    sectionSummary: string;
    essentialFacts: string[];
  } | null;
};

const text = (value: unknown, max = 50000): value is string => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_-]{1,79}$/i.test(value);
const list = (value: unknown, max = 50): value is string[] => Array.isArray(value) && value.length <= max && value.every((item) => text(item, 2000));

export function createWriterInputFingerprint(input: WriterInput): string {
  const canonical = stableStringify(input);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (record(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateWriterContent(value: unknown, input?: WriterInput, requireStrategy = false): { ok: true; value: WriterContent } | { ok: false; error: "WRITER_OUTPUT_INVALID" } {
  if (!record(value) || !id(value.chapterNodeId) || !id(value.sectionNodeId) || !text(value.sectionTitle, 120)
    || typeof value.contentMarkdown !== "string" || value.contentMarkdown.length > 50000 || !Array.isArray(value.strategyMapping) || (requireStrategy && value.strategyMapping.length < 1) || value.strategyMapping.length > 20
    || !list(value.sourceUsed) || !list(value.missingInfo) || !list(value.humanConfirmation) || !text(value.sectionSummary, 4000)) return { ok: false, error: "WRITER_OUTPUT_INVALID" };
  const mapping: WriterStrategyMapping[] = [];
  for (const item of value.strategyMapping) {
    if (!record(item) || !text(item.problem, 4000) || !list(item.evidence, 20) || !text(item.strategy, 4000) || !Array.isArray(item.measures) || item.measures.length < 1 || !list(item.measures, 20)) return { ok: false, error: "WRITER_OUTPUT_INVALID" };
    mapping.push({ problem: item.problem.trim(), evidence: item.evidence.map((v) => v.trim()), strategy: item.strategy.trim(), measures: item.measures.map((v) => v.trim()) });
  }
  const content: WriterContent = { chapterNodeId: value.chapterNodeId, sectionNodeId: value.sectionNodeId, sectionTitle: value.sectionTitle.trim(), contentMarkdown: value.contentMarkdown.trim(), strategyMapping: mapping, sourceUsed: value.sourceUsed.map((v) => v.trim()), missingInfo: value.missingInfo.map((v) => v.trim()), humanConfirmation: value.humanConfirmation.map((v) => v.trim()), sectionSummary: value.sectionSummary.trim() };
  if (input && (content.chapterNodeId !== input.target.chapterNodeId || content.sectionNodeId !== input.target.sectionNodeId || content.sectionTitle !== input.target.sectionTitle || content.sourceUsed.some((materialId) => !input.adoptedMaterials.some((material) => material.materialId === materialId)))) return { ok: false, error: "WRITER_OUTPUT_INVALID" };
  return { ok: true, value: content };
}

function iso(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function tokens(value: unknown): value is WriterTokenUsage { return record(value) && [value.inputTokens, value.outputTokens, value.totalTokens].every((item) => item === null || (typeof item === "number" && Number.isInteger(item) && item >= 0)); }

export function validateWriterSuggestion(value: unknown): value is WriterSuggestion {
  return record(value) && text(value.generationId, 120) && text(value.generationRequestId, 120) && text(value.provider, 120) && text(value.requestedModel, 120) && text(value.resolvedModel, 120)
    && (value.providerResponseId === null || text(value.providerResponseId, 200)) && text(value.promptVersion, 120) && text(value.promptSource, 240) && text(value.parentPromptVersion, 120)
    && typeof value.contentHash === "string" && /^[a-f0-9]{64}$/.test(value.contentHash) && value.contractVersion === WRITER_OUTPUT_CONTRACT_VERSION && typeof value.inputFingerprint === "string" && /^[a-f0-9]{64}$/.test(value.inputFingerprint)
    && tokens(value.tokenUsage) && typeof value.latencyMs === "number" && Number.isInteger(value.latencyMs) && value.latencyMs >= 0 && typeof value.attemptCount === "number" && Number.isInteger(value.attemptCount) && value.attemptCount >= 1 && value.attemptCount <= 2 && iso(value.startedAt) && iso(value.completedAt) && value.generatedAt === value.completedAt && iso(value.generatedAt) && validateWriterContent(value.content).ok;
}
