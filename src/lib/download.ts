export interface DownloadItem {
  filename: string;
  blob: Blob;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(
  filename: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export async function downloadAll(items: DownloadItem[], intervalMs = 180): Promise<void> {
  for (const item of items) {
    downloadBlob(item.filename, item.blob);
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
}

export function safeFilename(name: string, fallback = 'result'): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return trimmed || fallback;
}
