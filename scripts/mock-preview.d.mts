import type { IncomingMessage, ServerResponse } from 'node:http';

export const MOCK_PATH_PREFIX: string;
export function createMockMiddleware(
  configRaw: string | undefined,
): (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>;
