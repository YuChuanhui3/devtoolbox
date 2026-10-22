import { Link } from 'react-router-dom';
import { Braces, Heart, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { APP_VERSION } from '@/lib/appInfo';

interface FooterProps {
  onShowShortcuts: () => void;
}

export function Footer({ onShowShortcuts }: FooterProps) {
  const { t } = useI18n();

  return (
    <footer className="mt-12 border-t border-line bg-surface/50 no-print">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Braces className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">DevToolbox</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-ink-3">
              {t({
                zh: '面向开发者的一站式在线工具箱。文本、JSON 与图片默认在浏览器本地处理。',
                en: 'A one-stop online toolbox for developers. Text, JSON and images are processed locally in your browser by default.',
              })}
            </p>
          </div>
        </div>

        <nav
          aria-label={t({ zh: '页脚导航', en: 'Footer navigation' })}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2"
        >
          <Link to="/about" className="transition-colors hover:text-accent-strong">
            {t({ zh: '关于', en: 'About' })}
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-accent-strong">
            {t({ zh: '隐私说明', en: 'Privacy' })}
          </Link>
          <button
            type="button"
            onClick={onShowShortcuts}
            className="transition-colors hover:text-accent-strong"
          >
            {t({ zh: '快捷键', en: 'Shortcuts' })}
          </button>
          <span className="inline-flex items-center gap-1 text-ink-3">
            <ShieldCheck className="h-3.5 w-3.5 text-ok" aria-hidden="true" />
            {t({ zh: '本地处理', en: 'Local processing' })}
          </span>
          <span className="font-mono text-ink-3">v{APP_VERSION}</span>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-ink-3 sm:flex-row sm:px-6">
          <p>
            © {new Date().getFullYear()} DevToolbox ·{' '}
            {t({ zh: '纯前端静态站点', en: 'a fully static front-end site' })}
          </p>
          <p className="inline-flex items-center gap-1">
            Built with <Heart className="h-3 w-3 text-danger" aria-hidden="true" /> React + Vite + Tailwind
          </p>
        </div>
      </div>
    </footer>
  );
}
