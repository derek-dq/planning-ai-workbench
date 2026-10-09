import { DemoApp, type DemoView } from "../demo";

const views = new Set<DemoView>([
  "dashboard",
  "projects",
  "overview",
  "materials",
  "outline",
  "chapters",
  "review",
  "deliverables",
  "settings",
]);

export default async function DemoPage({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const candidate = (await params).view?.[0] as DemoView | undefined;
  return <DemoApp initialView={candidate && views.has(candidate) ? candidate : "dashboard"} />;
}
