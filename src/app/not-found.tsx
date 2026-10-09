import Link from "next/link";
export default function NotFound() { return <div className="content-page"><h1>页面未找到</h1><p>请返回项目库选择项目。</p><Link className="button" href="/projects">返回项目库</Link></div>; }
