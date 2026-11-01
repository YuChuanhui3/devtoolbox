/// <reference lib="webworker" />
import { matchRegex, type RegexMatchRequest } from './regexMatch';

interface WorkerRequest extends RegexMatchRequest {
  seq: number;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { seq, ...request } = event.data;
  (self as DedicatedWorkerGlobalScope).postMessage({ seq, outcome: matchRegex(request) });
};
