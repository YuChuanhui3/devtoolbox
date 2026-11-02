import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import WebSocket from 'ws';
import { attachLanSignaling, LAN_SIGNAL_PATH } from '../../scripts/lan-signaling.mjs';

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  const current = server;
  server = null;
  await new Promise<void>((resolve) => current.close(() => resolve()));
});

describe('LAN signaling room', () => {
  it('queues the host offer and relays the phone answer', async () => {
    server = http.createServer();
    attachLanSignaling(server);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const url = `ws://127.0.0.1:${address.port}${LAN_SIGNAL_PATH}`;

    const host = new WebSocket(url);
    await new Promise<void>((resolve) => host.once('open', () => resolve()));
    host.send(JSON.stringify({ type: 'create', room: 'test-room-123' }));
    host.send(JSON.stringify({ type: 'signal', payload: 'offer-payload' }));

    const guest = new WebSocket(url);
    await new Promise<void>((resolve) => guest.once('open', () => resolve()));
    const peerJoined = new Promise<string>((resolve) => host.once('message', (data) => resolve(JSON.parse(String(data)).type)));
    const offer = new Promise<string>((resolve) => guest.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (message.type === 'signal') resolve(message.payload);
    }));
    guest.send(JSON.stringify({ type: 'join', room: 'test-room-123' }));
    await expect(peerJoined).resolves.toBe('peer-joined');
    await expect(offer).resolves.toBe('offer-payload');

    const answer = new Promise<string>((resolve) => host.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (message.type === 'signal') resolve(message.payload);
    }));
    guest.send(JSON.stringify({ type: 'signal', payload: 'answer-payload' }));
    await expect(answer).resolves.toBe('answer-payload');

    host.close();
    guest.close();
  });
});
