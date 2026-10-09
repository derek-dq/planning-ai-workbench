"use client";
import { ErrorState } from "@/components/page-states";
export default function ErrorBoundary() { return <div className="content-page"><ErrorState title="页面暂时无法加载" description="请刷新页面后重试。" /></div>; }
