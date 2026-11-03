/**
 * lan-relay：/__lan-signal 信令中继的 Cloudflare Worker 版。
 * 协议与 scripts/lan-signaling.mjs 完全一致：create/join/signal/peer-joined/closed，
 * 房间口令（pass）在 join 时校验；只中继一次性 SDP，文件、文本、扫码内容都不经过中继。
 *
 * 部署：cd workers/lan-relay && npx wrangler deploy
 * 用法：把 https://<project>.<account>.workers.dev 填入传输页「高级 · 信令地址」。
 */
const LAN_SIGNAL_PATH = '/__lan-signal';
const ROOM_TTL_MS = 5 * 60 * 1000;
const MAX_ROOMS = 200;
const ROOM_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname !== LAN_SIGNAL_PATH) {
      return new Response('lan-relay: WebSocket signaling only. Connect to /__lan-signal.', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      });
    }
    const hub = env.HUB.get(env.HUB.idFromName('hub'));
    return hub.fetch(request);
  },
};

export class RelayHub {
  constructor(state) {
    this.state = state;
    this.rooms = new Map();
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.bind(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    this.sweep();
    if (this.rooms.size > 0) await this.armAlarm();
  }

  bind(server) {
    let joinedRoom = '';
    let role = '';

    server.addEventListener('message', (event) => {
      this.sweep();
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        this.send(server, { type: 'error', reason: 'invalid-message' });
        return;
      }

      if (message.type === 'create') {
        const pass = typeof message.pass === 'string' ? message.pass.slice(0, 16).toUpperCase() : '';
        const room = String(message.room ?? '');
        if (joinedRoom || !ROOM_PATTERN.test(room) || this.rooms.size >= MAX_ROOMS || this.rooms.has(room)) {
          this.send(server, { type: 'error', reason: 'room-unavailable' });
          return;
        }
        joinedRoom = room;
        role = 'host';
        this.rooms.set(room, { host: server, guest: null, offer: null, pass, expires: Date.now() + ROOM_TTL_MS });
        this.send(server, { type: 'created', room });
        this.state.waitUntil(this.armAlarm());
        return;
      }

      if (message.type === 'join') {
        const room = this.rooms.get(message.room);
        if (joinedRoom || !room || room.guest || room.host?.readyState !== 1) {
          this.send(server, { type: 'error', reason: 'room-not-found' });
          return;
        }
        // 口令不符与房间不存在分开报错，与 Node 版信令保持一致。
        if (room.pass && String(message.pass ?? '').trim().toUpperCase() !== room.pass) {
          this.send(server, { type: 'error', reason: 'bad-pass' });
          server.close();
          return;
        }
        joinedRoom = message.room;
        role = 'guest';
        room.guest = server;
        this.send(server, { type: 'joined', room: joinedRoom });
        this.send(room.host, { type: 'peer-joined' });
        if (room.offer) this.send(server, { type: 'signal', payload: room.offer });
        return;
      }

      if (message.type === 'signal' && typeof message.payload === 'string') {
        const room = this.rooms.get(joinedRoom);
        if (!room) {
          this.send(server, { type: 'error', reason: 'room-not-found' });
          return;
        }
        if (role === 'host') {
          room.offer = message.payload;
          this.send(room.guest, { type: 'signal', payload: message.payload });
        } else if (role === 'guest') {
          this.send(room.host, { type: 'signal', payload: message.payload });
        }
      }
    });

    server.addEventListener('close', () => {
      if (joinedRoom) this.closeRoom(joinedRoom, role === 'host' ? 'host-left' : 'guest-left');
    });
    server.addEventListener('error', () => server.close());
  }

  send(socket, message) {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message));
  }

  closeRoom(room, reason = 'closed') {
    const current = this.rooms.get(room);
    if (!current) return;
    this.rooms.delete(room);
    this.send(current.host, { type: 'closed', reason });
    this.send(current.guest, { type: 'closed', reason });
    current.host?.close();
    current.guest?.close();
  }

  sweep() {
    const now = Date.now();
    for (const [room, state] of [...this.rooms]) {
      if (state.expires <= now) this.closeRoom(room, 'expired');
    }
  }

  async armAlarm() {
    let earliest = Infinity;
    for (const state of this.rooms.values()) earliest = Math.min(earliest, state.expires);
    if (earliest < Infinity) await this.state.storage.setAlarm(earliest);
  }
}
