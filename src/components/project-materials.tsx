"use client";

import Link from "next/link";
import { useState } from "react";

import {
  MATERIAL_USAGE_STATUSES,
  type MaterialDocument,
  type MaterialParseStatus,
  type MaterialReadiness,
  type MaterialUsageStatus,
  type MaterialVersionStatus,
  type ProfessionalConfirmationStatus,
} from "@/domain/materials/schema";

const parseLabels: Record<MaterialParseStatus, string> = {
  uploaded: "已上传",
  parsing: "解析中",
  parsed: "解析完成",
  failed: "解析失败",
};

const versionLabels: Record<MaterialVersionStatus, string> = {
  current: "当前版本",
  superseded: "历史版本",
  conflict: "版本冲突",
  unknown: "暂无法判断",
};

const usageLabels: Record<MaterialUsageStatus, string> = {
  adopted: "已采用",
  reference_only: "仅作参考",
  pending_review: "待确认采用",
  excluded: "不采用",
};

const professionalLabels: Record<ProfessionalConfirmationStatus, string> = {
  not_required: "无需确认",
  pending: "待专业确认",
  confirmed: "已确认",
  rejected: "已否决",
};

type SaveError = {
  materialId: string;
  message: string;
} | null;

export function ProjectMaterials({
  projectId,
  initialMaterials,
  initialReadiness,
}: {
  projectId: string;
  initialMaterials: MaterialDocument[];
  initialReadiness: MaterialReadiness;
}) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [savingMaterialId, setSavingMaterialId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<SaveError>(null);

  async function saveUsage(materialId: string, materialUsageStatus: MaterialUsageStatus) {
    setMaterials((current) => current.map((material) => (
      material.materialId === materialId ? { ...material, materialUsageStatus } : material
    )));
    setSavingMaterialId(materialId);
    setSaveError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/materials/${materialId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialUsageStatus }),
      });
      if (!response.ok) throw new Error("资料采用状态保存失败");
      const result = await response.json() as {
        material: MaterialDocument;
        readiness: MaterialReadiness;
      };
      setMaterials((current) => current.map((material) => (
        material.materialId === materialId ? result.material : material
      )));
      setReadiness(result.readiness);
    } catch {
      setSaveError({ materialId, message: "采用状态尚未保存，请保留当前选择并重试。" });
    } finally {
      setSavingMaterialId(null);
    }
  }

  const adoptedCount = materials.filter((material) => material.materialUsageStatus === "adopted").length;
  const referenceCount = materials.filter((material) => material.materialUsageStatus === "reference_only").length;
  const pendingCount = materials.filter((material) => material.materialUsageStatus === "pending_review").length;

  return (
    <div className="materials-page">
      <div className="page-header materials-heading">
        <div>
          <p className="eyebrow">项目资料</p>
          <h1>项目资料准备</h1>
          <p className="lead">查看固定演示资料摘要，并明确每份资料是否作为当前项目依据。</p>
        </div>
        {readiness.canGenerate ? (
          <Link className="button" href={`/projects/${projectId}/workbench/outline`}>
            前往方案结构
          </Link>
        ) : (
          <span className="button disabled" aria-disabled="true">前往方案结构</span>
        )}
      </div>

      <section className="material-metrics" aria-label="资料状态汇总">
        <Metric label="资料总数" value={materials.length} />
        <Metric label="已采用" value={adoptedCount} tone="success" />
        <Metric label="仅作参考" value={referenceCount} tone="neutral" />
        <Metric label="待确认采用" value={pendingCount} tone="warning" />
        <Metric label="待补充资料" value={readiness.knownMissingMaterials.length} tone="danger" />
      </section>

      <div className="materials-layout">
        <section className="table-card material-library">
          <div className="section-heading">
            <div>
              <h2>基础资料库</h2>
              <p>当前为固定 Mock 摘要，不读取或解析真实文件正文。</p>
            </div>
          </div>
          {materials.length === 0 ? (
            <div className="material-empty">
              <h3>尚无项目资料</h3>
              <p>普通新建项目不会复制演示项目事实。请在后续文件解析切片中补充真实资料。</p>
            </div>
          ) : (
            <div className="material-list">
              {materials.map((material) => {
                const hasError = saveError?.materialId === material.materialId;
                return (
                  <article className="material-card" key={material.materialId}>
                    <div className="material-card-main">
                      <div className="material-title-line">
                        <span className="material-code">{material.materialId}</span>
                        <h3>{material.title}</h3>
                      </div>
                      <p>{material.summary}</p>
                      <div className="status-groups" aria-label={`${material.title}资料状态`}>
                        <Status label="解析" value={parseLabels[material.materialParseStatus]} />
                        <Status label="版本" value={versionLabels[material.materialVersionStatus]} />
                        <Status label="专业确认" value={professionalLabels[material.professionalConfirmationStatus]} />
                      </div>
                    </div>
                    <div className="material-usage">
                      <label htmlFor={`usage-${material.materialId}`}>采用状态</label>
                      <select
                        id={`usage-${material.materialId}`}
                        value={material.materialUsageStatus}
                        disabled={savingMaterialId === material.materialId}
                        onChange={(event) => void saveUsage(material.materialId, event.target.value as MaterialUsageStatus)}
                      >
                        {MATERIAL_USAGE_STATUSES.map((status) => (
                          <option key={status} value={status}>{usageLabels[status]}</option>
                        ))}
                      </select>
                      <span className="save-indicator" aria-live="polite">
                        {savingMaterialId === material.materialId ? "保存中…" : hasError ? "尚未保存" : "已保存"}
                      </span>
                      {hasError && (
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => void saveUsage(material.materialId, material.materialUsageStatus)}
                        >
                          重试
                        </button>
                      )}
                    </div>
                    {hasError && <p className="inline-error">{saveError.message}</p>}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="readiness-panel" aria-label="资料完整度检查">
          <div className={readiness.canGenerate ? "readiness-summary ready" : "readiness-summary blocked"}>
            <p className="eyebrow">资料完整度检查</p>
            <h2>{readiness.canGenerate ? "生成条件已满足" : "暂不能生成方案结构"}</h2>
            <p>
              {readiness.canGenerate
                ? "项目背景和成果要求已具备。真实生成能力将在下一批接入。"
                : "必须先补齐或采用项目背景与成果要求。"}
            </p>
          </div>

          {readiness.blockingMissing.length > 0 && (
            <ReadinessList title="阻断生成" items={readiness.blockingMissing} tone="danger" />
          )}
          <ReadinessList
            title="待补充资料"
            items={readiness.knownMissingMaterials}
            emptyText="当前没有已知的非阻断资料缺口。"
            tone="warning"
          />
          <ReadinessList
            title="待专业确认"
            items={readiness.pendingProfessionalConfirmations}
            emptyText="当前没有待专业确认的资料。"
            tone="neutral"
          />
        </aside>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "neutral" | "warning" | "danger";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>项</small>
    </article>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <span className="material-status">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function ReadinessList({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items: Array<{ title: string; reason: string }>;
  emptyText?: string;
  tone: "danger" | "warning" | "neutral";
}) {
  return (
    <section className={`readiness-list ${tone}`}>
      <h3>{title}<span>{items.length}</span></h3>
      {items.length === 0 ? <p>{emptyText}</p> : (
        <ul>
          {items.map((item) => (
            <li key={`${title}-${item.title}`}>
              <strong>{item.title}</strong>
              <p>{item.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
