import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildJoinUrl, isPickupCode, lanSocketUrl, makePickupCode, resolveLanBase } from './lanSignal';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LAN one-scan pairing helpers', () => {
  it('builds a join link and a same-origin WebSocket URL', () => {
    const join = buildJoinUrl('http://192.168.1.20:4173', 'room-123');
    expect(join).toBe('http://192.168.1.20:4173/tools/transfer-toolkit?pair=room-123');
    expect(lanSocketUrl('http://192.168.1.20:4173')).toBe('ws://192.168.1.20:4173/__lan-signal');
    expect(lanSocketUrl('https://toolbox.lan')).toBe('wss://toolbox.lan/__lan-signal');
  });

  it('creates 6-digit pickup codes accepted by the signaling server', () => {
    expect(makePickupCode()).toMatch(/^\d{6}$/);
    expect(makePickupCode()).not.toBe(makePickupCode());
    expect(isPickupCode(' 123456 ')).toBe(true);
    expect(isPickupCode('12345')).toBe(false);
    expect(isPickupCode('12345a')).toBe(false);
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
