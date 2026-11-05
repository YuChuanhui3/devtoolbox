import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
export const HOPPSCOTCH_STATUS_PATH: string;
export function handleHoppscotchStatus(request: IncomingMessage, response: ServerResponse): Promise<void>;
export function hoppscotchStatusPlugin(): Plugin;
