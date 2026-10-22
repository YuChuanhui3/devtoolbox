import { describe, expect, test } from 'vitest';
import {
  buildSsLink,
  buildSsrLink,
  buildVmessLink,
  parseSsLink,
  parseSsrLink,
  parseVmessLink,
  type ShadowsocksRFields,
} from './proxyLink';

const b64 = (text: string) => Buffer.from(text, 'utf-8').toString('base64');

describe('vmess://', () => {
  test('parse a real-style link', () => {
    const link = `vmess://${b64(
      JSON.stringify({
        v: '2',
        ps: 'Tokyo-1',
        add: 'example.com',
        port: '443',
        id: '129e7c0c-c694-4b1c-8f7a-0e7c48bcdef1',
        aid: '0',
        scy: 'auto',
        net: 'ws',
        host: 'example.com',
        path: '/ws',
        tls: 'tls',
      }),
    )}`;
    const fields = parseVmessLink(link);
    expect(fields.ps).toBe('Tokyo-1');
    expect(fields.add).toBe('example.com');
    expect(fields.host).toBe('example.com');
    expect(fields.net).toBe('ws');
  });

  test('build → parse round trip', () => {
    const link = buildVmessLink({ add: '1.2.3.4', id: 'uuid-1', port: '8443', ps: 'home' });
    expect(link.startsWith('vmess://')).toBe(true);
    const fields = parseVmessLink(link);
    expect(fields.add).toBe('1.2.3.4');
    expect(fields.id).toBe('uuid-1');
  });

  test('errors', () => {
    expect(() => parseVmessLink('ss://abc')).toThrow('vmess://');
    expect(() => buildVmessLink({ ps: 'no add' })).toThrow('VMess 生成失败');
  });
});

describe('ss://', () => {
  test('SIP002 round trip with colon in password', () => {
    const fields = {
      method: 'aes-256-gcm',
      password: 'p:ss:pwd',
      server: 'node.example.com',
      port: '8443',
      name: '节点 1',
    };
    const parsed = parseSsLink(buildSsLink(fields));
    expect(parsed).toEqual(fields);
  });

  test('legacy format parse', () => {
    const parsed = parseSsLink(`ss://${b64('chacha20-ietf-poly1305:legacy-pw@203.0.113.9:8388')}`);
    expect(parsed.server).toBe('203.0.113.9');
    expect(parsed.port).toBe('8388');
    expect(parsed.password).toBe('legacy-pw');
  });

  test('build validation', () => {
    expect(() => buildSsLink({ method: '', password: 'x', server: 'y', port: '1', name: '' })).toThrow(
      'SS 生成失败',
    );
  });
});

describe('ssr://', () => {
  test('build → parse round trip', () => {
    const fields: ShadowsocksRFields = {
      method: 'aes-128-ctr',
      password: 'ssr!pw',
      server: 'ssr.example.com',
      port: '443',
      name: 'HK',
      protocol: 'origin',
      obfs: 'plain',
      protocolParam: '',
      obfsParam: '',
    };
    const link = buildSsrLink(fields);
    expect(link.startsWith('ssr://')).toBe(true);
    const parsed = parseSsrLink(link);
    expect(parsed.server).toBe(fields.server);
    expect(parsed.port).toBe(fields.port);
    expect(parsed.password).toBe(fields.password);
    expect(parsed.method).toBe(fields.method);
    expect(parsed.protocol).toBe('origin');
    expect(parsed.obfs).toBe('plain');
  });

  test('keeps optional params', () => {
    const parsed = parseSsrLink(
      buildSsrLink({
        method: 'aes-256-cfb',
        password: 'pw',
        server: 'a.example',
        port: '8080',
        name: '备注',
        protocol: 'auth_aes128_md5',
        obfs: 'tls1.2_ticket_auth',
        protocolParam: '1234:567',
        obfsParam: 'example.com',
      }),
    );
    expect(parsed.name).toBe('备注');
    expect(parsed.protocolParam).toBe('1234:567');
    expect(parsed.obfsParam).toBe('example.com');
  });
});
