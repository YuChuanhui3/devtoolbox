import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function prepareLocalFrontend(root) {
  const indexPath = join(root, "index.html");
  let html = readFileSync(indexPath, "utf8");
  const entry = html.match(/src="\/assets\/(index-[^"]+\.js)"/)[1];
  const path = join(root, "assets", entry);
  let js = readFileSync(path, "utf8");
  if (!js.includes("DEVTOOLBOX_LOCAL_ONLY")) {
    const auth = /auth:([\w$]+)\.auth,kernelIO:/;
    if (!auth.test(js) || !/infra:\w+,backend:/.test(js))
      throw new Error(
        "Unsupported upstream bundle: local platform patch needs review",
      );
    js = js.replace(
      auth,
      'auth:{...$1.auth,performAuthInit:async()=>{},getAllowedAuthProviders:async()=>({_tag:"Right",right:[]}),processMagicLink:async()=>{},getCurrentUser:()=>null,getProbableUser:()=>null},kernelIO:',
    );
    js = js.replace(
      /sync:\{history:\w+\},kernelInterceptors:/,
      "sync:undefined,kernelInterceptors:",
    );
    js = js.replace(/infra:\w+,backend:/, "infra:undefined,backend:");
    js = js.replace(
      /additionalLinks:\[\w+\],addedServices:\[\]/,
      "additionalLinks:[],addedServices:[]",
    );
    js += "\n/* DEVTOOLBOX_LOCAL_ONLY */\n";
    writeFileSync(path, js);
  }
  // Upstream 2026.10 moved dispatcher synchronization into a shared module.
  // Disable the shared sync predicate as well as the platform history adapter.
  if (!js.includes('DEVTOOLBOX_NO_DISPATCH_SYNC')) {
    const syncEntry = 'const E8=(A,e,t,i)=>{let n,s,r=t();';
    if (!js.includes(syncEntry)) throw new Error('Unsupported upstream sync dispatcher');
    js = js.replace(syncEntry, 'const E8=(A,e,t,i)=>{t=()=>false;i=undefined;let n,s,r=t();');
    js += '\n/* DEVTOOLBOX_NO_DISPATCH_SYNC */\n';
    writeFileSync(path, js);
  }
  html = html
    .replace(/<style data-devtoolbox-theme>[\s\S]*?<\/style>/g, "")
    .replace(/<script src="\/local-only.js"><\/script>/g, "");
  const css = readFileSync(
    new URL("../integrations/hoppscotch/theme/workbench.css", import.meta.url),
    "utf8",
  );
  html = html.replace(
    "</head>",
    `<style data-devtoolbox-theme>${css}</style><script src="/local-only.js"></script></head>`,
  );
  writeFileSync(indexPath, html);
}
