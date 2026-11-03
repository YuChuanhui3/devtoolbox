import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildJoinUrl,
  getSignalBase,
  isPickupCode,
  isRoomPass,
  lanSocketUrl,
  makePickupCode,
  makeRoomPass,
  normalizeRoomPass,
  resolveLanBase,
  resolveSignalTargets,
  setSignalBase,
} from './lanSignal';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('LAN one-scan pairing helpers', () => {
  it('builds a join link and a same-origin WebSocket URL', () => {
    const join = buildJoinUrl('http://192.168.1.20:4173', 'room-123');
    expect(join).toBe('http://192.168.1.20:4173/tools/transfer-toolkit?pair=room-123');
    expect(lanSocketUrl('http://192.168.1.20:4173')).toBe('ws://192.168.1.20:4173/__lan-signal');
    expect(lanSocketUrl('https://toolbox.lan')).toBe('wss://toolbox.lan/__lan-signal');
  });

  it('carries passphrase and relay origin in the join link', () => {
    const join = buildJoinUrl('https://pages.example', '123456', 'AB23', 'https://relay.example');
    expect(join).toBe('https://pages.example/tools/transfer-toolkit?pair=123456&pp=AB23&sig=https%3A%2F%2Frelay.example');
    const sameOrigin = buildJoinUrl('http://192.168.1.20:4173', '123456', 'AB23', 'http://192.168.1.20:4173');
    expect(sameOrigin).toBe('http://192.168.1.20:4173/tools/transfer-toolkit?pair=123456&pp=AB23');
  });

  it('keeps wss bases intact when building socket URLs', () => {
    expect(lanSocketUrl('wss://relay.example')).toBe('wss://relay.example/__lan-signal');
  });

  it('creates 6-digit pickup codes accepted by the signaling server', () => {
    expect(makePickupCode()).toMatch(/^\d{6}$/);
    expect(makePickupCode()).not.toBe(makePickupCode());
    expect(isPickupCode(' 123456 ')).toBe(true);
    expect(isPickupCode('12345')).toBe(false);
    expect(isPickupCode('12345a')).toBe(false);
  });

  it('creates 4-character passphrases without confusable glyphs', () => {
    expect(makeRoomPass()).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(normalizeRoomPass(' ab23 ')).toBe('AB23');
    expect(isRoomPass('ab23')).toBe(true);
    expect(isRoomPass('ABC')).toBe(false);
    expect(isRoomPass('AB_3')).toBe(false);
  });

  it('stores a custom signaling base and routes targets through it', async () => {
    setSignalBase('https://relay.example/deploy');
    expect(getSignalBase()).toBe('https://relay.example');
    await expect(resolveSignalTargets('https://pages.example/tools/transfer-toolkit')).resolves.toEqual({
      pageBase: 'https://pages.example',
      signalBase: 'https://relay.example',
    });
    setSignalBase('');
    expect(getSignalBase()).toBe('');
  });

  it('rejects malformed signaling URLs and falls back to LAN resolution', async () => {
    expect(() => setSignalBase('not a url')).toThrow();
    expect(getSignalBase()).toBe('');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ addresses: ['192.168.1.20'] }),
    }));
    await expect(resolveSignalTargets('http://localhost:4173/tools/transfer-toolkit')).resolves.toEqual({
      pageBase: 'http://192.168.1.20:4173',
      signalBase: 'http://192.168.1.20:4173',
    });
  });

  it('replaces localhost with an address reported by the LAN server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ addresses: ['192.168.1.20'] }),
    }));

    await expect(resolveLanBase('http://localhost:4173/tools/transfer-toolkit')).resolves.toBe('http://192.168.1.20:4173');
  });

  it('keeps an existing LAN origin unchanged', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLanBase('http://192.168.1.20:4173/tools/transfer-toolkit')).resolves.toBe('http://192.168.1.20:4173');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
