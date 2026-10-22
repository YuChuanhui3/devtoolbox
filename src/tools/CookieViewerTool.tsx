import { useMemo, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Textarea } from '@/components/ui/Textarea';
import { Panel } from '@/components/ui/Panel';
import { CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { parseCookieString, type CookieItem } from '@/lib/cookie';

function CookieTable({ items, emptyText }: { items: CookieItem[]; emptyText: Localized }) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <div className="px-4 py-8 text-center text-xs text-ink-3">{t(emptyText)}</div>;
  }
  const text = items.map((item) => `${item.name}=${item.value}`).join('\n');
  return (
    <>
      <ul className="divide-y divide-line">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-44 shrink-0 break-all font-mono text-[12px] text-accent-strong">{item.name}</span>
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">{item.value || t({ zh: '（空）', en: '(empty)' })}</code>
            <CopyIconButton text={item.value} label={t({ zh: `复制 ${item.name} 的值`, en: `Copy ${item.name} value` })} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="text-xs text-ink-3">{t({ zh: `共 ${items.length} 项 · 值已自动 URL 解码`, en: `${items.length} entries · values automatically URL-decoded` })}</span>
        <DownloadButton filename="cookies.txt" content={text} label={{ zh: '下载列表', en: 'Download list' }} />
      </div>
    </>
  );
}

export default function CookieViewerTool() {
  const { t } = useI18n();
  const [pasteInput, setPasteInput] = useState('');

  const ownCookies = useMemo(() => parseCookieString(document.cookie), []);
  const pastedItems = useMemo(() => parseCookieString(pasteInput), [pasteInput]);

  return (
    <div className="space-y-4">
      <ToolAlert
        tone="warning"
        title={t({ zh: '只能读取当前站点的 Cookie', en: 'Only this site\'s cookies can be read' })}
        hint={t({ zh: 'HttpOnly 与跨域 Cookie 无法被浏览器脚本获取。查询其他站点 Cookie 请从浏览器开发者工具（Application → Cookies）复制 Cookie 头字符串，粘贴到下方解析。', en: 'HttpOnly and cross-origin cookies are not accessible to browser scripts. To inspect another site, copy the Cookie header string from DevTools (Application → Cookies) and paste it below.' })}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={t({ zh: '本站可见 Cookie', en: 'Cookies visible on this site' })}
          subtitle={t({ zh: `来源：document.cookie · ${window.location.host}`, en: `Source: document.cookie · ${window.location.host}` })}
          bodyClassName="p-0"
        >
          <CookieTable items={ownCookies} emptyText={{ zh: '当前站点没有可读取的 Cookie', en: 'No readable cookies on this site' }} />
        </Panel>

        <Panel title={t({ zh: '粘贴解析', en: 'Paste to parse' })} subtitle={t({ zh: '支持 Cookie 头 / name=value 列表', en: 'Accepts Cookie header / name=value list' })} bodyClassName="p-0">
          <div className="space-y-3 p-4">
            <Textarea
              value={pasteInput}
              onChange={(event) => setPasteInput(event.target.value)}
              rows={5}
              mono
              className="text-xs"
              placeholder={t({ zh: 'Cookie: sid=abc123; theme=dark\n或逐行粘贴 name=value', en: 'Cookie: sid=abc123; theme=dark\nor paste name=value, one per line' })}
              aria-label={t({ zh: 'Cookie 字符串', en: 'Cookie string' })}
            />
            <button
              type="button"
              onClick={() => setPasteInput('')}
              className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-accent/40 hover:text-accent-strong"
            >
              <Eraser className="h-3 w-3" aria-hidden="true" />
              {t({ zh: '清空', en: 'Clear' })}
            </button>
          </div>
          <div className="border-t border-line">
            <CookieTable items={pastedItems} emptyText={{ zh: '粘贴 Cookie 字符串后在此解析', en: 'Parsed cookies appear here after you paste a Cookie string' }} />
          </div>
        </Panel>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: 'Cookie 属于敏感数据，本工具全部在浏览器本地解析，不会发送到任何服务器。', en: 'Cookies are sensitive data. Everything is parsed locally in the browser and never sent to any server.' })}
      </p>
    </div>
  );
}
