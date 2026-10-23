import { Link } from 'react-router-dom';
import {
  Braces,
  ClipboardCopy,
  Cpu,
  Keyboard,
  Layers,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { TOOLS } from '@/data/tools';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { useSeo } from '@/hooks/useSeo';
import { copyText } from '@/lib/clipboard';
import { APP_VERSION } from '@/lib/appInfo';

const FEATURES: Array<{ icon: typeof Zap; title: L10n; description: L10n }> = [
  {
    icon: Zap,
    title: { zh: '即时反馈', en: 'Instant feedback' },
    description: {
      zh: '输入即处理或一键执行，结果与错误提示清晰可见，常用工具支持示例数据。',
      en: 'Process as you type or with one click, with clear results and error messages. Popular tools include sample data.',
    },
  },
  {
    icon: ShieldCheck,
    title: { zh: '本地优先', en: 'Local-first' },
    description: {
      zh: '文本、JSON、YAML 与图片默认在浏览器内处理，不上传服务器，不记录用户输入。',
      en: 'Text, JSON, YAML and images are processed in the browser by default — no uploads, no logging of your input.',
    },
  },
  {
    icon: Layers,
    title: { zh: '统一交互', en: 'Consistent UX' },
    description: {
      zh: '所有工具遵循统一的输入、操作、结果与错误规范，切换工具无需重新学习。',
      en: 'Every tool follows the same input, action, result and error conventions, so switching tools costs nothing to learn.',
    },
  },
  {
    icon: Sparkles,
    title: { zh: '持续扩展', en: 'Growing catalog' },
    description: {
      zh: '通过统一的工具注册机制接入新能力，后续可平滑增加更多开发者工具。',
      en: 'New capabilities plug in through a shared tool registry, so more developer tools can be added smoothly.',
    },
  },
];

const STACK = ['React 19', 'TypeScript', 'Vite', 'Tailwind CSS', 'Zustand', 'marked + DOMPurify'];

export function AboutPage() {
  const { t } = useI18n();
  useSeo(
    { zh: '关于本站', en: 'About' },
    {
      zh: '了解 DevToolbox 的定位、功能特色、技术栈与反馈方式。',
      en: 'Learn about DevToolbox: its mission, features, tech stack and how to send feedback.',
    },
  );

  const toast = useToast();

  const copyFeedback = async () => {
    const template = t({
      zh: [
        '【DevToolbox 反馈】',
        `页面：${window.location.href}`,
        `浏览器：${navigator.userAgent}`,
        `时间：${new Date().toLocaleString('zh-CN')}`,
        '',
        '问题描述：',
        '复现步骤：',
        '期望结果：',
      ].join('\n'),
      en: [
        '[DevToolbox feedback]',
        `Page: ${window.location.href}`,
        `Browser: ${navigator.userAgent}`,
        `Time: ${new Date().toLocaleString('en-US')}`,
        '',
        'Problem:',
        'Steps to reproduce:',
        'Expected result:',
      ].join('\n'),
    });

    const ok = await copyText(template);
    toast[ok ? 'success' : 'error'](
      ok
        ? t({ zh: '反馈模板已复制，可粘贴到反馈渠道', en: 'Feedback template copied — paste it into your feedback channel' })
        : t({ zh: '复制失败，请手动复制', en: 'Copy failed, please copy manually' }),
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl [background-image:var(--btn-grad)] text-white shadow-[0_8px_22px_rgba(33,150,243,0.3)]">
            <Braces className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] font-semibold leading-tight tracking-[0.01em] text-ink">
                {t({ zh: '关于 DevToolbox', en: 'About DevToolbox' })}
              </h1>
              <Badge tone="accent">v{APP_VERSION}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-2">
              {t({
                zh: `DevToolbox 是一个面向开发者、测试、产品与内容人员的轻量级在线工具箱，提供 ${TOOLS.length} 个高频工具，覆盖数据格式、编码加密、开发调试、文本处理、Markdown 与图像处理。`,
                en: `DevToolbox is a lightweight online toolbox for developers, testers, product and content people, offering ${TOOLS.length} everyday tools across data formats, encoding & encryption, debugging, text processing, Markdown and image tools.`,
              })}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to="/tools"
            className="inline-flex h-9 items-center rounded-full px-4 text-xs font-medium text-white shadow-[0_6px_18px_rgba(33,150,243,0.28)] [background-image:var(--btn-grad)] transition-transform duration-300 hover:-translate-y-0.5"
          >
            {t({ zh: '浏览全部工具', en: 'Browse all tools' })}
          </Link>
          <Link
            to="/privacy"
            className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-4 text-xs text-ink-2 transition-colors hover:border-accent/40 hover:text-accent-strong"
          >
            {t({ zh: '阅读隐私说明', en: 'Read privacy notes' })}
          </Link>
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-ink">{t({ zh: '功能特色', en: 'Highlights' })}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title.zh} className="card-surface p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-ink">{t(feature.title)}</h3>
                <p className="mt-1.5 text-xs leading-5 text-ink-3">{t(feature.description)}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card-surface p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Cpu className="h-5 w-5 text-accent" aria-hidden="true" />
          {t({ zh: '技术栈', en: 'Tech stack' })}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-3">
          {t({
            zh: '纯前端静态站点，无需后端即可运行。所有依赖均为浏览器端可执行的开源库。',
            en: 'A pure front-end static site that runs without any backend. Every dependency is an open-source library executing in the browser.',
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STACK.map((item) => (
            <span
              key={item}
              className="rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-[11px] text-ink-2"
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="card-surface p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <ShieldCheck className="h-5 w-5 text-ok" aria-hidden="true" />
          {t({ zh: '隐私原则', en: 'Privacy principles' })}
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-2">
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {t({
              zh: '大部分工具在浏览器本地运行，文本、JSON、YAML、图片等内容默认不会上传服务器。',
              en: 'Most tools run locally in the browser; text, JSON, YAML, images and other content are never uploaded by default.',
            })}
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {t({
              zh: '收藏、最近使用、工具草稿与 Markdown 草稿仅保存在本机 localStorage，可随时清空。',
              en: 'Favorites, recent history, tool drafts and the Markdown draft stay in your local localStorage and can be cleared anytime.',
            })}
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {t({
              zh: '无账号体系、无广告、无第三方统计脚本；本地匿名统计只记录次数，不包含输入内容。',
              en: 'No accounts, no ads, no third-party analytics; local anonymous stats count usage only and never include your input.',
            })}
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {t({
              zh: '请勿在加密、JWT、AES 等工具中输入生产环境的敏感密钥。',
              en: 'Do not enter production secrets into the encryption, JWT or AES tools.',
            })}
          </li>
        </ul>
        <Link
          to="/privacy"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline"
        >
          {t({ zh: '查看完整隐私说明', en: 'Read the full privacy notes' })}
        </Link>
      </section>

      <section className="card-surface p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Keyboard className="h-5 w-5 text-accent" aria-hidden="true" />
          {t({ zh: '快捷键', en: 'Shortcuts' })}
        </h2>
        <div className="mt-3 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
          <p>
            <span className="font-mono text-xs text-ink">⌘ / Ctrl + K</span>
            {' · '}
            {t({ zh: '打开全局搜索', en: 'Open global search' })}
          </p>
          <p>
            <span className="font-mono text-xs text-ink">⌘ / Ctrl + S</span>
            {' · '}
            {t({ zh: 'Markdown 下载 .md', en: 'Download Markdown as .md' })}
          </p>
          <p>
            <span className="font-mono text-xs text-ink">⌘ / Ctrl + B</span>
            {' · '}
            {t({ zh: 'Markdown 加粗', en: 'Bold in Markdown' })}
          </p>
          <p>
            <span className="font-mono text-xs text-ink">⌘ / Ctrl + I</span>
            {' · '}
            {t({ zh: 'Markdown 斜体', en: 'Italic in Markdown' })}
          </p>
          <p>
            <span className="font-mono text-xs text-ink">↑ / ↓ + Enter</span>
            {' · '}
            {t({ zh: '搜索选择与打开', en: 'Navigate and open search results' })}
          </p>
          <p>
            <span className="font-mono text-xs text-ink">Esc</span>
            {' · '}
            {t({ zh: '关闭弹层', en: 'Close overlays' })}
          </p>
        </div>
      </section>

      <section id="feedback" className="rounded-card border border-line bg-surface-2/60 p-5">
        <h2 className="text-lg font-semibold text-ink">{t({ zh: '反馈与建议', en: 'Feedback & suggestions' })}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-3">
          {t({
            zh: '本站为纯前端静态站点，反馈入口由部署维护方提供。你可以先复制一份包含环境信息的反馈模板，再粘贴到对应的 Issue、群聊或工单中。',
            en: 'This is a pure static site; the feedback channel is provided by whoever deploys it. Copy a feedback template pre-filled with environment info, then paste it into an issue, chat or ticket.',
          })}
        </p>
        <Button variant="secondary" className="mt-3" onClick={copyFeedback}>
          <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
          {t({ zh: '复制反馈模板', en: 'Copy feedback template' })}
        </Button>
      </section>
    </div>
  );
}
