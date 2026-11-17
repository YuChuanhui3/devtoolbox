import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { downloadBlob } from '@/lib/download';
import { useI18n } from '@/i18n/I18nProvider';

const sprites = Object.values(import.meta.glob('../assets/hold-up-sign/*.png', { eager: true, query: '?url', import: 'default' })) as string[];
export default function HoldUpSignTool() {
  const { t } = useI18n();
  const [text, setText] = useState('今天也要开心呀');
  const [columns, setColumns] = useState(8);
  const [seed, setSeed] = useState(0);
  const [transparent, setTransparent] = useState(true);
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setStatus('');
    const lines = text.replace(/\r\n?/g, '\n').split('\n').flatMap(line => {
      const chars = Array.from(line);
      return chars.length ? Array.from({ length: Math.ceil(chars.length / columns) }, (_, i) => chars.slice(i * columns, (i + 1) * columns)) : [[]];
    });
    if (!text.trim()) return;
    const images = sprites.map(src => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
    }));
    void Promise.all(images).then(loaded => {
      if (cancelled || !canvas.current) return;
      if (!loaded.length) throw new Error('Missing sprites');
      const target = canvas.current;
      target.width = Math.max(...lines.map((line, r) => (lines.length - r - 1) * 35 + Math.max(0, line.length - 1) * 45 + 80));
      target.height = Math.max(...lines.map((line, r) => r * 50 + Math.max(0, line.length - 1) * 25 + 165));
      const ctx = target.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, target.width, target.height); }
      lines.forEach((line, r) => line.forEach((char, c) => {
        const x = (lines.length - r - 1) * 35 + c * 45;
        const y = r * 50 + c * 25;
        ctx.drawImage(loaded[Math.floor(Math.random() * loaded.length)], x, y, 80, 165);
        ctx.save(); ctx.translate(x + 23, y + 30); ctx.rotate(28 * Math.PI / 180);
        ctx.fillStyle = '#180e00'; ctx.font = '25px sans-serif'; ctx.fillText(char, 0, 0, 32); ctx.restore();
      }));
      setReady(true);
    }).catch(() => { if (!cancelled) setStatus(t({ zh: '素材加载失败，请刷新后重试。', en: 'Unable to load artwork. Please reload.' })); });
    return () => { cancelled = true; };
  }, [text, columns, seed, transparent, t]);
  return <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
    <Panel title={t({ zh: '举牌内容', en: 'Your message' })}>
      <div className="space-y-4">
        <label className="block text-sm">{t({ zh: '文字（最多 160 字，支持换行）', en: 'Message (up to 160 characters)' })}
          <textarea className="mt-2 w-full rounded-md border border-line bg-surface p-3 text-ink" rows={5} maxLength={160} value={text} onChange={e => setText(e.target.value)} />
        </label>
        <label className="block text-sm">{t({ zh: '每行字数', en: 'Characters per row' })}: {columns}
          <input className="mt-2 w-full" type="range" min={1} max={12} value={columns} onChange={e => setColumns(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} />{t({ zh: '透明背景', en: 'Transparent background' })}</label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready} onClick={() => setSeed(s => s + 1)}>{t({ zh: '换一批小人', en: 'Shuffle crowd' })}</Button>
          <Button variant="primary" disabled={!ready} onClick={() => canvas.current?.toBlob(blob => {
            if (blob) downloadBlob('hold-up-sign.png', blob);
            else setStatus(t({ zh: '导出失败，请重试。', en: 'Export failed. Please retry.' }));
          }, 'image/png')}>{t({ zh: '下载 PNG', en: 'Download PNG' })}</Button>
        </div>
        <p className="text-xs text-ink-3">{t({ zh: '文字和图片均在浏览器本地处理。', en: 'Your message and image stay in this browser.' })}</p>
      </div>
    </Panel>
    <Panel title={t({ zh: '图片预览', en: 'Preview' })}>
      <div className="flex min-h-80 items-center justify-center overflow-auto rounded-md bg-surface-2 p-4">
        <canvas ref={canvas} hidden={!ready} aria-label={t({ zh: '小人举牌图片预览', en: 'Crowd holding your message' })} className="h-auto max-w-full" />
        {!ready && <p role="status" className="text-sm text-ink-3">{status || (text.trim() ? t({ zh: '正在生成…', en: 'Generating…' }) : t({ zh: '输入文字开始生成', en: 'Enter a message to begin' }))}</p>}
      </div>
    </Panel>
  </div>;
}
