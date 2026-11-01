import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/data/tools';
import { TOOL_COMPONENTS } from './registry';

describe('工具注册表完整性', () => {
  const toolIds = TOOLS.map((tool) => tool.id);

  it('每个已登记工具都有懒加载组件', () => {
    const missing = toolIds.filter((id) => !(id in TOOL_COMPONENTS));
    expect(missing).toEqual([]);
  });

  it('注册表里没有孤儿组件（未登记的工具 id）', () => {
    const orphan = Object.keys(TOOL_COMPONENTS).filter((id) => !toolIds.includes(id));
    expect(orphan).toEqual([]);
  });

  it('工具 id 无重复', () => {
    expect(new Set(toolIds).size).toBe(toolIds.length);
  });

  it('README 声明的工具数与实际一致', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain(`${TOOLS.length} 个高频工具箱`);
  });
});
