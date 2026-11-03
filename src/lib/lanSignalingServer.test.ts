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

  it('rejects a wrong passphrase and accepts the matching one', async () => {
    server = http.createServer();
    attachLanSignaling(server);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const url = `ws://127.0.0.1:${address.port}${LAN_SIGNAL_PATH}`;

    const host = new WebSocket(url);
    await new Promise<void>((resolve) => host.once('open', () => resolve()));
    host.send(JSON.stringify({ type: 'create', room: 'pass-room-123', pass: 'AB23' }));

    const wrong = new WebSocket(url);
    await new Promise<void>((resolve) => wrong.once('open', () => resolve()));
    const wrongReason = new Promise<string>((resolve) => wrong.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (message.type === 'error') resolve(message.reason);
    }));
    wrong.send(JSON.stringify({ type: 'join', room: 'pass-room-123', pass: 'ZZZZ' }));
    await expect(wrongReason).resolves.toBe('bad-pass');

    const right = new WebSocket(url);
    await new Promise<void>((resolve) => right.once('open', () => resolve()));
    const joined = new Promise<string>((resolve) => right.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (message.type === 'joined') resolve(message.type);
    }));
    right.send(JSON.stringify({ type: 'join', room: 'pass-room-123', pass: 'ab23' }));
    await expect(joined).resolves.toBe('joined');

    host.close();
    right.close();
  });
});
