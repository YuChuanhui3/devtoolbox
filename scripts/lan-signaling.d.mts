import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HttpServer } from 'vite';

export const LAN_SIGNAL_PATH: string;
export const LAN_INFO_PATH: string;
export function lanAddresses(): string[];
export function handleLanInfo(request: IncomingMessage, response: ServerResponse): void;
export function attachLanSignaling(server: HttpServer | null): void;
