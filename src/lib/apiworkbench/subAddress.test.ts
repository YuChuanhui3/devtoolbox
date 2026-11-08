import { describe, expect, test } from 'vitest';
import { foldSubMode } from './subAddress';

describe('二级寻址折算', () => {
  test('搜索面板写出的 ?mode=graphql 折回请求页签的 body 区域', () => {
    expect(foldSubMode('graphql')).toEqual({ mode: 'request', sub: 'graphql' });
    expect(foldSubMode('codegen')).toEqual({ mode: 'request', sub: 'code' });
    expect(foldSubMode('oauth')).toEqual({ mode: 'request', sub: 'auth' });
  });

  test('四个实时协议折进实时页签，协议名放 proto', () => {
    expect(foldSubMode('websocket')).toEqual({ mode: 'realtime', proto: 'websocket' });
    expect(foldSubMode('sse')).toEqual({ mode: 'realtime', proto: 'sse' });
    expect(foldSubMode('socketio')).toEqual({ mode: 'realtime', proto: 'socketio' });
    expect(foldSubMode('mqtt')).toEqual({ mode: 'realtime', proto: 'mqtt' });
  });

  test('真页签与缺失的 mode 不动 URL', () => {
    expect(foldSubMode('mock')).toBeNull();
    expect(foldSubMode('realtime')).toBeNull();
    expect(foldSubMode('openapi')).toBeNull();
    expect(foldSubMode(null)).toBeNull();
  });
});
