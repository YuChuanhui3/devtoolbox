import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Download,
  LoaderCircle,
  Settings2,
  X,
} from "lucide-react";
import { useHoppscotchClient } from "@/hooks/useHoppscotchClient";
import { useI18n } from "@/i18n/I18nProvider";
import { loadWorkbench } from "@/lib/apiworkbench/store";
import {
  exportHoppscotchCollections,
  exportHoppscotchEnvironments,
} from "@/lib/apiworkbench/hoppscotch";
import { downloadText } from "@/lib/download";
import "./http-toolkit/hoppscotch-host.css";

const LocalExtensions = lazy(() => import("./HttpToolkitTool"));
const configuredUrl = import.meta.env.VITE_HOPPSCOTCH_URL as string | undefined;

/** Mount the upstream application unchanged, so features do not diverge from the source. */
export default function HoppscotchTool() {
  const [params] = useSearchParams();
  const extensions =
    params.get("engine") === "local" ||
    ["mock", "stress", "openapi"].includes(params.get("mode") ?? "");
  if (extensions)
    return (
      <Suspense fallback={null}>
        <LocalExtensions />
      </Suspense>
    );
  return (
    <UpstreamWorkbench
      feature={params.get("sub") ?? params.get("mode") ?? ""}
    />
  );
}
function UpstreamWorkbench({ feature }: { feature: string }) {
  const { t } = useI18n();
  const { url, ready, checking, reconnect } =
    useHoppscotchClient(configuredUrl);
  const [menu, setMenu] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const syncTheme = () =>
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "devtoolbox:theme",
        dark: document.documentElement.classList.contains("dark"),
      },
      new URL(url).origin,
    );
  useEffect(() => {
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [url]);
  const routes: Record<string, string> = {
    websocket: "realtime/websocket",
    sse: "realtime/sse",
    socketio: "realtime/socketio",
    mqtt: "realtime/mqtt",
    graphql: "graphql",
  };
  const applicationUrl = routes[feature]
    ? `${url.replace(/\/$/, "")}/${routes[feature]}`
    : url;
  const migrate = (kind: "collections" | "environments") => {
    const doc = loadWorkbench();
    downloadText(
      kind === "collections"
        ? exportHoppscotchCollections(doc.collections)
        : exportHoppscotchEnvironments(doc.environments),
      `devtoolbox-${kind}.json`,
      "application/json",
    );
  };
  return (
    <div className="hopp-host">
      {ready ? (
        <iframe
          ref={frameRef}
          onLoad={syncTheme}
          title="Hoppscotch API workspace"
          src={applicationUrl}
          allow="clipboard-read; clipboard-write; fullscreen; web-share"
          allowFullScreen
        />
      ) : (
        <main className="hopp-startup">
          <span className="hopp-startup-mark">H</span>
          <h1>
            {t({
              zh: "Hoppscotch 本地工作台",
              en: "Local Hoppscotch workspace",
            })}
          </h1>
          <p>
            {t({
              zh: "集合、环境和历史保存在当前浏览器，无需账号或数据库。",
              en: "Collections, environments and history stay in this browser. No accounts or database.",
            })}
          </p>
          <code>npm run api:start</code>
          <p>
            {t({
              zh: "服务启动后会自动连接，首次准备需提取官方前端资源。",
              en: "Connects automatically when ready. First setup extracts the official frontend assets.",
            })}
          </p>
          <button type="button" onClick={reconnect} disabled={checking}>
            {checking ? (
              <LoaderCircle size={14} className="hopp-loading" />
            ) : null}
            {t({
              zh: checking ? "检查服务中" : "重新连接",
              en: checking ? "Checking services" : "Reconnect",
            })}
          </button>
          <Link to="/tools/http-simulator?engine=local">
            {t({
              zh: "打开原有本地工具与历史数据",
              en: "Open local tools and previous data",
            })}
          </Link>
        </main>
      )}
      <button
        type="button"
        className="hopp-host-toggle"
        onClick={() => setMenu(!menu)}
        aria-expanded={menu}
        aria-label={t({ zh: "工具箱集成菜单", en: "Toolbox integration menu" })}
      >
        {menu ? <X size={14} /> : <Settings2 size={14} />}
      </button>
      {menu ? (
        <aside className="hopp-host-menu">
          <strong>DevToolbox × Hoppscotch</strong>
          <Link to="/tools">
            <ArrowLeft size={14} />
            {t({ zh: "返回工具箱", en: "Back to toolbox" })}
          </Link>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            {t({
              zh: "独立打开完整工作台",
              en: "Open full workspace in a tab",
            })}
          </a>
          <hr />
          <button type="button" onClick={() => migrate("collections")}>
            <Download size={14} />
            {t({
              zh: "导出旧版集合供导入",
              en: "Export previous collections for import",
            })}
          </button>
          <button type="button" onClick={() => migrate("environments")}>
            <Download size={14} />
            {t({
              zh: "导出旧版环境供导入",
              en: "Export previous environments for import",
            })}
          </button>
          <p>
            {t({
              zh: "在 Hoppscotch 的集合或环境面板中导入导出的 JSON。旧数据会保留。",
              en: "Import the exported JSON in Hoppscotch collections or environments. Previous data is kept.",
            })}
          </p>
          <Link to="/tools/http-simulator?engine=local&mode=mock">
            {t({ zh: "本地 Mock 扩展", en: "Local Mock extension" })}
          </Link>
          <Link to="/tools/http-simulator?engine=local&mode=stress">
            {t({ zh: "压测扩展", en: "Load testing extension" })}
          </Link>
          <Link to="/tools/http-simulator?engine=local">
            {t({
              zh: "原有工作台与历史",
              en: "Previous workspace and history",
            })}
          </Link>
        </aside>
      ) : null}
    </div>
  );
}
