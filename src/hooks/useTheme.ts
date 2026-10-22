import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

export function useApplyTheme(): void {
  const mode = useAppStore((state) => state.themeMode);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark = mode === 'dark' || (mode === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', isDark ? '#0b0f17' : '#f6f8fb');
      }
    };

    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);
}
