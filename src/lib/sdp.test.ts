import { describe, expect, test } from 'vitest';
import {
  COMPRESSED_PREFIX,
  compactSdp,
  decodeSignal,
  encodeSignal,
  hasMdnsCandidate,
  isMdnsAddress,
  isSignalText,
  isValidIpv4,
  parseCandidates,
  replaceMdnsAddresses,
  SIGNAL_PREFIX,
} from './sdp';

const SAMPLE_SDP = [
  'v=0',
  'o=- 123 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'a=mid:0',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:0123456789abcdef0123456789abcdef',
  'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
  'a=setup:actpass',
  'a=sctp-port:5000',
  'a=candidate:1 1 udp 2113937151 192.168.1.5 50000 typ host generation 0',
  'a=candidate:4 1 udp 2113937152 fe80::1 50003 typ host',
  'a=candidate:2 1 udp 1677729535 203.0.113.7 50001 typ srflx raddr 192.168.1.5 rport 50000',
  'a=candidate:3 1 udp 1694498815 10.99.0.2 50002 typ relay raddr 203.0.113.7',
  'a=remote-candidates:1 192.168.1.5 50000',
  'a=candidate-acl:host',
  'a=end-of-candidates',
  '',
].join('\r\n');

describe('compactSdp', () => {
  test('keeps host candidates and essential lines, drops srflx/relay/noise', () => {
    const compact = compactSdp(SAMPLE_SDP);
    expect(compact).toContain('v=0');
    expect(compact).toContain('m=application');
    expect(compact).toContain('a=ice-ufrag:abcd');
    expect(compact).toContain('a=fingerprint:');
    expect(compact).toContain('typ host');
    expect(compact).toContain('fe80::1');
    expect(compact).not.toContain('typ srflx');
    expect(compact).not.toContain('typ relay');
    expect(compact).not.toContain('a=remote-candidates');
    expect(compact).not.toContain('a=candidate-acl');
    expect(compact.length).toBeLessThan(SAMPLE_SDP.length);
  });
});

describe('encodeSignal / decodeSignal', () => {
  test('round trip compresses when CompressionStream is available', async () => {
    const envelope = { type: 'offer' as const, sdp: SAMPLE_SDP };
    const text = await encodeSignal(envelope);
    const expectedPrefix = typeof CompressionStream === 'function' ? COMPRESSED_PREFIX : SIGNAL_PREFIX;
    expect(text.startsWith(expectedPrefix)).toBe(true);
    expect(await decodeSignal(text)).toEqual(envelope);
    if (expectedPrefix === COMPRESSED_PREFIX) {
      expect(text.length).toBeLessThan(SIGNAL_PREFIX.length + SAMPLE_SDP.length);
    }
  });

  test('decodes legacy plaintext envelope', async () => {
    const plain =
      SIGNAL_PREFIX + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ type: 'answer', sdp: SAMPLE_SDP }))));
    expect(await decodeSignal(plain)).toEqual({ type: 'answer', sdp: SAMPLE_SDP });
  });

  test('tolerates surrounding whitespace from copy/paste', async () => {
    const text = await encodeSignal({ type: 'answer', sdp: SAMPLE_SDP });
    expect((await decodeSignal(`  \n${text}  `)).type).toBe('answer');
  });

  test('isSignalText accepts both envelopes only', () => {
    expect(isSignalText(`${SIGNAL_PREFIX}abc`)).toBe(true);
    expect(isSignalText(` ${COMPRESSED_PREFIX}abc `)).toBe(true);
    expect(isSignalText('hello world')).toBe(false);
  });

  test('rejects foreign text', async () => {
    await expect(decodeSignal('hello world')).rejects.toThrowError(/连接信息无效/);
  });

  test('rejects corrupted payload', async () => {
    await expect(decodeSignal(`${SIGNAL_PREFIX}%%%not-base64%%%`)).rejects.toThrowError(/已损坏/);
    await expect(decodeSignal(`${COMPRESSED_PREFIX}QUJD`)).rejects.toThrowError(/已损坏/);
  });

  test('rejects well-formed base64 with wrong shape', async () => {
    const bogus = SIGNAL_PREFIX + btoa(JSON.stringify({ type: 'poke', sdp: 42 }));
    await expect(decodeSignal(bogus)).rejects.toThrowError(/格式不正确/);
  });

  test('encode rejects empty envelope', async () => {
    await expect(encodeSignal({ type: 'offer', sdp: '' })).rejects.toThrowError('连接信息生成失败');
  });
});

const MDNS_SDP = [
  'v=0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'a=candidate:914006730 1 udp 2113937151 08e71a6a-64a1-429b-860b-1005a2d050ec.local 55610 typ host generation 0 network-cost 999',
  'a=candidate:511095408 1 udp 1677730559 203.0.113.9 49210 typ srflx raddr 0.0.0.0 rport 0',
  'a=end-of-candidates',
  '',
].join('\r\n');

describe('mDNS 兜底', () => {
  test('parseCandidates reads address, port and type', () => {
    expect(parseCandidates(MDNS_SDP)).toEqual([
      { address: '08e71a6a-64a1-429b-860b-1005a2d050ec.local', port: 55610, type: 'host' },
      { address: '203.0.113.9', port: 49210, type: 'srflx' },
    ]);
  });

  test('hasMdnsCandidate only fires on the fake hostname', () => {
    expect(hasMdnsCandidate(MDNS_SDP)).toBe(true);
    expect(hasMdnsCandidate(SAMPLE_SDP)).toBe(false);
    expect(isMdnsAddress('192.168.1.9')).toBe(false);
  });

  test('replaceMdnsAddresses swaps only host aliases and keeps the port', () => {
    const rewritten = replaceMdnsAddresses(MDNS_SDP, '192.168.1.23');
    expect(rewritten).toContain('192.168.1.23 55610 typ host');
    expect(rewritten).not.toContain('.local');
    expect(rewritten).toContain('203.0.113.9 49210 typ srflx');
    expect(hasMdnsCandidate(rewritten)).toBe(false);
  });

  test('an invalid IP leaves the SDP untouched', () => {
    for (const bad of ['', '192.168.1', '256.1.1.1', '01.2.3.4', '192.168.1.23:8080']) {
      expect(isValidIpv4(bad)).toBe(false);
      expect(replaceMdnsAddresses(MDNS_SDP, bad)).toBe(MDNS_SDP);
    }
    expect(isValidIpv4(' 10.0.0.1 ')).toBe(true);
  });

  test('compactSdp keeps srflx only when the STUN fallback is on', () => {
    expect(compactSdp(MDNS_SDP)).not.toContain('typ srflx');
    expect(compactSdp(MDNS_SDP, true)).toContain('203.0.113.9 49210 typ srflx');
  });
});
