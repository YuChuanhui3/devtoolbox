declare module '*native-workspaces/runtime.js' {
  export function getScope(name: string): { host: HTMLElement; started: Promise<void> | null };
  export function loadCloudSdk(): Promise<void>;
}
declare module '*native-workspaces/whiteboard/main.js' { export function mountWorkspace(): Promise<void>; }
declare module '*native-workspaces/pdf/main.js' { export function mountWorkspace(): Promise<void>; }

declare module '*native-workspaces/localize.js' { export function localizeWorkspace(host: HTMLElement, locale: 'zh' | 'en'): () => void; }
