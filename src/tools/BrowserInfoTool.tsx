import { useMemo } from 'react';
import { UAParser } from 'ua-parser-js';
import { Panel } from '@/components/ui/Panel';
import { ActionBar, CopyButton, CopyIconButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';

interface InfoGroup {
  title: L10n;
  fields: [L10n, Localized][];
}

function readWebGl(): [L10n, Localized][] {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return [[{ zh: 'WebGL', en: 'WebGL' }, { zh: '不可用', en: 'Unavailable' }]];
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return [
      [{ zh: 'WebGL 版本', en: 'WebGL version' }, String(gl.getParameter(gl.VERSION))],
      [{ zh: 'GPU 厂商', en: 'GPU vendor' }, debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : { zh: '（受限）', en: '(restricted)' }],
      [{ zh: 'GPU 型号', en: 'GPU model' }, debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : { zh: '（受限）', en: '(restricted)' }],
    ];
  } catch {
    return [[{ zh: 'WebGL', en: 'WebGL' }, { zh: '读取失败', en: 'Read failed' }]];
  }
}

export default function BrowserInfoTool() {
  const { t } = useI18n();
  const groups = useMemo<InfoGroup[]>(() => {
    const parsed = new UAParser().getResult();
    const nav = navigator;
    const browser = [parsed.browser.name, parsed.browser.version].filter(Boolean).join(' ');
    const engine = [parsed.engine.name, parsed.engine.version].filter(Boolean).join(' ');
    const os = [parsed.os.name, parsed.os.version].filter(Boolean).join(' ');
    const cores = nav.hardwareConcurrency;
    const memory = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
    const doNotTrack = (nav as Navigator & { doNotTrack?: string }).doNotTrack;
    return [
      {
        title: { zh: 'User-Agent 解析', en: 'User-Agent parsing' },
        fields: [
          [{ zh: '浏览器', en: 'Browser' }, browser || { zh: '未知', en: 'Unknown' }],
          [{ zh: '引擎', en: 'Engine' }, engine || { zh: '未知', en: 'Unknown' }],
          [{ zh: '操作系统', en: 'Operating system' }, os || { zh: '未知', en: 'Unknown' }],
          [{ zh: '设备类型', en: 'Device type' }, parsed.device.type || { zh: '桌面设备', en: 'Desktop' }],
          [{ zh: 'UA 字符串', en: 'UA string' }, nav.userAgent],
        ],
      },
      {
        title: { zh: '屏幕与窗口', en: 'Screen & window' },
        fields: [
          [{ zh: '屏幕分辨率', en: 'Screen resolution' }, `${screen.width} × ${screen.height}`],
          [{ zh: '可用区域', en: 'Available area' }, `${screen.availWidth} × ${screen.availHeight}`],
          [{ zh: '设备像素比 DPR', en: 'Device pixel ratio DPR' }, String(window.devicePixelRatio)],
          [{ zh: '窗口尺寸', en: 'Window size' }, `${window.innerWidth} × ${window.innerHeight}`],
          [{ zh: '色深', en: 'Color depth' }, `${screen.colorDepth} bit`],
        ],
      },
      {
        title: { zh: '语言与区域', en: 'Language & region' },
        fields: [
          [{ zh: '首选语言', en: 'Preferred language' }, nav.language],
          [{ zh: '语言列表', en: 'Language list' }, (nav.languages ?? []).join(', ')],
          [{ zh: '时区', en: 'Timezone' }, Intl.DateTimeFormat().resolvedOptions().timeZone],
          [{ zh: 'UTC 偏移', en: 'UTC offset' }, { zh: `${-new Date().getTimezoneOffset() / 60} 小时`, en: `${-new Date().getTimezoneOffset() / 60} hours` }],
        ],
      },
      {
        title: { zh: '硬件与能力', en: 'Hardware & capabilities' },
        fields: [
          [{ zh: '逻辑 CPU 核心', en: 'Logical CPU cores' }, cores == null ? { zh: '未知', en: 'Unknown' } : String(cores)],
          [{ zh: '内存（GB）', en: 'Memory (GB)' }, memory == null ? { zh: '未知', en: 'Unknown' } : String(memory)],
          [{ zh: '平台', en: 'Platform' }, nav.platform || { zh: '未知', en: 'Unknown' }],
          [{ zh: '在线状态', en: 'Online status' }, nav.onLine ? { zh: '在线', en: 'Online' } : { zh: '离线', en: 'Offline' }],
          [{ zh: 'Cookie 启用', en: 'Cookie enabled' }, String(nav.cookieEnabled)],
          [{ zh: 'Do Not Track', en: 'Do Not Track' }, doNotTrack ?? { zh: '未设置', en: 'Not set' }],
          [{ zh: '最大触摸点', en: 'Max touch points' }, String(nav.maxTouchPoints)],
        ],
      },
      {
        title: { zh: 'GPU 信息', en: 'GPU info' },
        fields: readWebGl(),
      },
      {
        title: { zh: '存储与配额', en: 'Storage & quota' },
        fields: [
          [{ zh: 'localStorage', en: 'localStorage' }, typeof localStorage !== 'undefined' ? { zh: '可用', en: 'Available' } : { zh: '不可用', en: 'Unavailable' }],
          [{ zh: 'sessionStorage', en: 'sessionStorage' }, typeof sessionStorage !== 'undefined' ? { zh: '可用', en: 'Available' } : { zh: '不可用', en: 'Unavailable' }],
          [{ zh: 'IndexedDB', en: 'IndexedDB' }, typeof indexedDB !== 'undefined' ? { zh: '可用', en: 'Available' } : { zh: '不可用', en: 'Unavailable' }],
          [{ zh: 'Service Worker', en: 'Service Worker' }, 'serviceWorker' in nav ? { zh: '支持', en: 'Supported' } : { zh: '不支持', en: 'Unsupported' }],
          [{ zh: '剪贴板 API', en: 'Clipboard API' }, nav.clipboard ? { zh: '支持', en: 'Supported' } : { zh: '不支持', en: 'Unsupported' }],
        ],
      },
    ];
  }, []);

  const allText = groups
    .map((g) => `【${t(g.title)}】\n${g.fields.map(([k, v]) => `${t(k)}: ${t(v)}`).join('\n')}`)
    .join('\n\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="px-1 text-xs text-ink-3">{t({ zh: '信息仅在本机读取，不会上传', en: 'Information is read locally and never uploaded' })}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} />
          <CopyButton
            text={JSON.stringify(
              Object.fromEntries(
                groups.map((g) => [t(g.title), Object.fromEntries(g.fields.map(([k, v]) => [t(k), t(v)]))]),
              ),
              null,
              2,
            )}
            label={{ zh: '复制 JSON', en: 'Copy JSON' }}
            variant="secondary"
          />
        </div>
      </ActionBar>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Panel key={group.title.zh} title={t(group.title)} bodyClassName="p-0">
            {group.fields.map(([label, value]) => (
              <div
                key={label.zh}
                className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <span className="w-28 shrink-0 text-xs text-ink-3">{t(label)}</span>
                <span className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">{t(value)}</span>
                <CopyIconButton text={t(value)} label={{ zh: `复制${label.zh}`, en: `Copy ${label.en}` }} />
              </div>
            ))}
          </Panel>
        ))}
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '部分字段（GPU、内存）受浏览器隐私策略限制，可能返回脱敏值或「未知」。', en: 'Some fields (GPU, memory) are limited by browser privacy policies and may return sanitized values or "Unknown".' })}
      </p>
    </div>
  );
}
