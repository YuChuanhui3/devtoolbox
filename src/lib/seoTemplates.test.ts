import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/data/tools';
import { toolSeoDescription, toolSeoIntro, toolSeoTitle } from './seoTemplates';

describe('SEO 标题模板', () => {
  it('不产生「工具箱工具」「Toolkit Tool」这类机械重复标题', () => {
    for (const tool of TOOLS) {
      const title = toolSeoTitle(tool);
      expect(title.zh).not.toMatch(/工具(箱)?工具/);
      expect(title.en).not.toMatch(/tool\s+tool/i);
      expect(toolSeoDescription(tool).zh).not.toMatch(/工具(箱)?工具/);
      expect(toolSeoIntro(tool).en).not.toMatch(/tool\s+tool/i);
    }
  });

  it('普通名称仍带关键词后缀', () => {
    const title = toolSeoTitle(TOOLS.find((tool) => tool.id === 'timestamp')!);
    expect(title.zh).toContain('工具');
    expect(title.en).toMatch(/ Tool$/);
  });

  it('工具箱类名称不重复追加后缀', () => {
    const crypto = TOOLS.find((tool) => tool.id === 'crypto-toolkit')!;
    expect(toolSeoTitle(crypto).zh).toBe('在线加解密工具箱');
    expect(toolSeoTitle(crypto).en).toBe('Online Cipher Toolkit');
  });
});
