/* Local-only shell: no accounts, synchronization, server sharing or publishing. */
(() => {
  const style = document.createElement("style");
  style.textContent = "[hidden]{display:none!important}";
  document.head.append(style);
  const blocked =
    /^\/(admin|profile|teams|enter|join-team|auth|mock-servers|published-docs)(\/|$)/;
  if (blocked.test(location.pathname)) location.replace("/");
  // Old service workers must not serve the former authenticated bundle.
  navigator.serviceWorker
    ?.getRegistrations()
    .then((rs) => rs.forEach((r) => r.unregister()));
  addEventListener("message", (event) => {
    let parentOrigin;
    try {
      parentOrigin = new URL(document.referrer).origin;
    } catch {
      return;
    }
    if (
      event.origin !== parentOrigin ||
      event.source !== parent ||
      event.data?.type !== "devtoolbox:theme"
    )
      return;
    document.documentElement.classList.toggle("dark", event.data.dark === true);
    document.documentElement.classList.remove("black");
  });
  const labels = new Set([
    "Shared Requests", "Mock Servers", "Published Documentation", "Published Docs", "共享请求", "已分享请求", "模拟服务器", "Mock 服务器", "发布文档", "Login",
    "Log in",
    "Sign in",
    "登录",
    "登入",
    "Save My Workspace",
    "保存我的工作区",
    "保存工作区",
    "Share",
    "分享",
    "共享",
    "Publish",
    "发布",
    "Create team",
    "创建团队",
    "New workspace",
    "新建工作区",
    "Switch workspace",
    "切换工作区",
  ]);
  function clean() {
    document.querySelectorAll('button,a,[role="button"]').forEach((el) => {
      const text = el.textContent.trim();
      const label = el.getAttribute("aria-label") || el.getAttribute("title");
      const href = el.getAttribute("href");
      if (labels.has(text) || labels.has(label) || (href && blocked.test(href)))
        el.hidden = true;
    });
    document
      .querySelectorAll(
        'a[href="/mock-servers"],a[href="/documentation"],a[href="/profile"]',
      )
      .forEach((el) => (el.hidden = true));
  }
  addEventListener("DOMContentLoaded", () => {
    new MutationObserver(clean).observe(document.body, {
      childList: true,
      subtree: true,
    });
    clean();
  });
})();
