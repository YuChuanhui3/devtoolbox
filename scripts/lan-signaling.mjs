import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

export const LAN_SIGNAL_PATH = '/__lan-signal';
export const LAN_INFO_PATH = '/api/lan-info';

const ROOM_TTL_MS = 5 * 60 * 1000;
const MAX_ROOMS = 100;
// 6 位数字取件码（FastSend 式）与 18 位链接房间号都要能通过
const ROOM_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

export function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const [a, b] = entry.address.split('.').map(Number);
      const privateAddress = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
      if (privateAddress) addresses.push(entry.address);
    }
  }
  return addresses;
}

export function handleLanInfo(_request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({ addresses: lanAddresses() }));
}

/**
 * 只中继一次性配对房间里的 SDP，不接触文件、文本或扫码内容。
 * DataChannel 建立后两端会主动断开 WebSocket，房间也随之销毁。
 */
export function attachLanSignaling(server) {
  if (!server) return;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  const rooms = new Map();

  const send = (socket, message) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message));
  };

  const closeRoom = (room, reason = 'closed') => {
    const current = rooms.get(room);
    if (!current) return;
    rooms.delete(room);
    clearTimeout(current.timer);
    send(current.host, { type: 'closed', reason });
    send(current.guest, { type: 'closed', reason });
    current.host?.close();
    current.guest?.close();
  };

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== LAN_SIGNAL_PATH) return;
    wss.handleUpgrade(request, socket, head, (websocket) => {
      wss.emit('connection', websocket, request);
    });
  });

  wss.on('connection', (socket) => {
    let joinedRoom = '';
    let role = '';

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        send(socket, { type: 'error', reason: 'invalid-message' });
        return;
      }

      if (message.type === 'create') {
        if (joinedRoom || !ROOM_PATTERN.test(message.room ?? '') || rooms.size >= MAX_ROOMS || rooms.has(message.room)) {
          send(socket, { type: 'error', reason: 'room-unavailable' });
          return;
        }
        joinedRoom = message.room;
        role = 'host';
        const room = { host: socket, guest: null, offer: null, timer: null };
        room.timer = setTimeout(() => closeRoom(joinedRoom, 'expired'), ROOM_TTL_MS);
        rooms.set(joinedRoom, room);
        send(socket, { type: 'created', room: joinedRoom });
        return;
      }

      if (message.type === 'join') {
        const room = rooms.get(message.room);
        if (joinedRoom || !room || room.guest || room.host?.readyState !== 1) {
          send(socket, { type: 'error', reason: 'room-not-found' });
          return;
        }
        joinedRoom = message.room;
        role = 'guest';
        room.guest = socket;
        send(socket, { type: 'joined', room: joinedRoom });
        send(room.host, { type: 'peer-joined' });
        if (room.offer) send(socket, { type: 'signal', payload: room.offer });
        return;
      }

      if (message.type === 'signal' && typeof message.payload === 'string') {
        const room = rooms.get(joinedRoom);
        if (!room) {
          send(socket, { type: 'error', reason: 'room-not-found' });
          return;
        }
        if (role === 'host') {
          room.offer = message.payload;
          send(room.guest, { type: 'signal', payload: message.payload });
        } else if (role === 'guest') {
          send(room.host, { type: 'signal', payload: message.payload });
        }
      }
    });

    socket.on('close', () => {
      if (joinedRoom) closeRoom(joinedRoom, role === 'host' ? 'host-left' : 'guest-left');
    });
    socket.on('error', () => socket.close());
  });
}
