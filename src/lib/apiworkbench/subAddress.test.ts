import { describe, expect, test } from 'vitest';
import { foldSubMode } from './subAddress';

describe('二级寻址折算', () => {
  test('搜索面板写出的 ?mode=graphql 折回请求页签的 body 区域', () => {
    expect(foldSubMode('graphql')).toEqual({ mode: 'request', sub: 'graphql' });
    expect(foldSubMode('codegen')).toEqual({ mode: 'request', sub: 'code' });
    expect(foldSubMode('oauth')).toEqual({ mode: 'request', sub: 'auth' });
  });

  test('真页签与缺失的 mode 不动 URL', () => {
    expect(foldSubMode('mock')).toBeNull();
    expect(foldSubMode('websocket')).toBeNull();
    expect(foldSubMode(null)).toBeNull();
  });
});
