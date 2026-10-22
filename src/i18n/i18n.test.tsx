import { describe, expect, test } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  detectLocale,
  HTML_LANG,
  isLocale,
  tl,
  type Localized,
} from './locale';
import { I18nProvider, useI18n } from './I18nProvider';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { useAppStore } from '@/store/appStore';

describe('tl / L10n 值对象', () => {
  const pair: Localized = { zh: '复制', en: 'Copy' };

  test('字符串原样返回', () => {
    expect(tl('固定文案', 'zh')).toBe('固定文案');
    expect(tl('固定文案', 'en')).toBe('固定文案');
  });

  test('L10n 按 locale 取值', () => {
    expect(tl(pair, 'zh')).toBe('复制');
    expect(tl(pair, 'en')).toBe('Copy');
  });

  test('isLocale 只接受 zh / en', () => {
    expect(isLocale('zh')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ja')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('detectLocale', () => {
  test('持久化偏好优先于浏览器语言', () => {
    expect(detectLocale('en', 'zh-CN')).toBe('en');
    expect(detectLocale('zh', 'en-US')).toBe('zh');
  });

  test('无持久化值时按浏览器语言：zh 系 → zh，其余 → en', () => {
    expect(detectLocale(undefined, 'zh-CN')).toBe('zh');
    expect(detectLocale(undefined, 'zh-TW')).toBe('zh');
    expect(detectLocale(undefined, 'en-US')).toBe('en');
    expect(detectLocale(undefined, 'de-DE')).toBe('en');
    expect(detectLocale('garbage', 'ja-JP')).toBe('en');
  });
});

describe('I18nProvider 与语言切换', () => {
  function Probe() {
    const { t, locale } = useI18n();
    return <span data-testid="probe">{`${locale}:${t({ zh: '你好', en: 'Hello' })}`}</span>;
  }

  test('切换 locale 同步文案、<html lang> 与持久化存储', () => {
    const initial = useAppStore.getState().locale;
    const { getByTestId, getByRole } = render(
      <I18nProvider>
        <Probe />
        <LanguageSwitch />
      </I18nProvider>,
    );

    expect(getByTestId('probe').textContent).toBe(`${initial}:${initial === 'zh' ? '你好' : 'Hello'}`);

    const group = getByRole('group', { name: '语言 / Language' });
    fireEvent.click(group.querySelector('button:last-child')!);

    expect(getByTestId('probe').textContent).toBe('en:Hello');
    expect(document.documentElement.lang).toBe(HTML_LANG.en);
    expect(useAppStore.getState().locale).toBe('en');

    fireEvent.click(group.querySelector('button:first-child')!);
    expect(getByTestId('probe').textContent).toBe('zh:你好');
    expect(document.documentElement.lang).toBe(HTML_LANG.zh);

    act(() => {
      useAppStore.setState({ locale: initial });
    });
  });

  test('mount 时按当前 locale 设置 <html lang>', () => {
    act(() => {
      useAppStore.setState({ locale: 'zh' });
    });
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
