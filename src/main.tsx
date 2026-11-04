import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import '@/index.css';
import { App } from '@/App';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';

const container = document.getElementById('root');

if (!container) {
  throw new Error('找不到应用挂载节点 #root');
}

// file:// 的 pathname 是磁盘路径，BrowserRouter 一个路由都匹配不上，深链只能走 hash。
const fromFileSystem = window.location.protocol === 'file:';
const Router = fromFileSystem ? HashRouter : BrowserRouter;

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <Router basename={fromFileSystem ? '/' : import.meta.env.BASE_URL}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </Router>
    </I18nProvider>
  </StrictMode>,
);
