import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 变化时自动重置错误状态（如切换工具路由）。 */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** 工具组件（含懒加载 chunk）抛错时兜底，避免整站白屏。 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const zh = (document.documentElement.lang || 'zh').startsWith('zh');
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-danger/25 bg-surface px-6 py-10 text-center shadow-card">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-ink">
          {zh ? '这个工具运行时出错了' : 'This tool hit a runtime error'}
        </p>
        <p className="max-w-md break-words text-xs text-ink-3">{this.state.error.message}</p>
        <div className="mt-1 flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => this.setState({ error: null })}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {zh ? '重试' : 'Retry'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
            {zh ? '刷新页面' : 'Reload page'}
          </Button>
        </div>
      </div>
    );
  }
}
