import { useEffect, useState } from "react";

/** Discover only the local static client. Never unmount a ready editor on a transient failure. */
export function useHoppscotchClient(configuredUrl?: string) {
  const [url, setUrl] = useState(configuredUrl ?? "http://127.0.0.1:3173");
  const [ready, setReady] = useState(Boolean(configuredUrl));
  const [checking, setChecking] = useState(!configuredUrl);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (configuredUrl || ready) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      setChecking(true);
      let connected = false;
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}__hoppscotch/status`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Client not ready");
        const status = await response.json();
        const target = new URL(status.url);
        if (!["http:", "https:"].includes(target.protocol))
          throw new Error("Invalid client URL");
        if (!controller.signal.aborted && status.ready === true) {
          setUrl(target.href);
          setReady(true);
          connected = true;
        }
      } catch {
        /* A stopped client is expected. */
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
          if (!connected) timer = setTimeout(check, 5000);
        }
      }
    };
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [configuredUrl, ready, attempt]);
  return {
    url,
    ready,
    checking,
    reconnect: () => setAttempt((value) => value + 1),
  };
}
