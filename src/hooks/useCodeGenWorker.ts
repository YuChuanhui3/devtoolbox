import { useCallback, useEffect, useRef, useState } from 'react';
import type { Localized } from '@/i18n/locale';
import type { CodeGenOptions, CodeGenRequest, CodeGenResponse, CodeLanguage } from '@/lib/codegen';
import JsonToCodeWorker from '@/workers/jsonToCode.worker?worker&inline';

export interface GenerationError {
  message: Localized;
  hint?: Localized;
  line?: number;
  column?: number;
  source?: string;
}

interface PendingRequest {
  id: number;
  language: CodeLanguage;
  json: string;
}

export interface CodeGenState {
  code: string;
  codeLanguage: CodeLanguage | null;
  nodeCount: number;
  durationMs: number | null;
  isGenerating: boolean;
  genError: GenerationError | null;
}

/**
 * json-to-code Worker 的请求、失效与状态管理：
 * 每次 requestGeneration 生成新 id，旧响应按 pending.id 丢弃；invalidate 用于清空输入。
 */
export function useCodeGenWorker() {
  const [state, setState] = useState<CodeGenState>({
    code: '',
    codeLanguage: null,
    nodeCount: 0,
    durationMs: null,
    isGenerating: false,
    genError: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<PendingRequest | null>(null);
  const lastRequestKeyRef = useRef('');

  const invalidate = useCallback(() => {
    requestIdRef.current += 1;
    pendingRef.current = null;
    lastRequestKeyRef.current = '';
    setState((previous) => ({ ...previous, isGenerating: false }));
  }, []);

  const resetOutput = useCallback(() => {
    setState({
      code: '',
      codeLanguage: null,
      nodeCount: 0,
      durationMs: null,
      isGenerating: false,
      genError: null,
    });
  }, []);

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setState((previous) => ({
        ...previous,
        genError: {
          message: {
            zh: '当前环境不支持 Web Worker，无法生成代码。',
            en: 'Web Workers are not available in this environment, so code cannot be generated.',
          },
          hint: {
            zh: '请使用最新版 Chrome、Edge、Firefox 或 Safari，并确认未禁用 JavaScript。',
            en: 'Use the latest Chrome, Edge, Firefox, or Safari and make sure JavaScript is enabled.',
          },
        },
      }));
      return;
    }

    let worker: Worker;
    try {
      worker = new JsonToCodeWorker();
    } catch {
      setState((previous) => ({
        ...previous,
        genError: {
          message: { zh: '代码生成线程启动失败。', en: 'Failed to start the code generation worker.' },
          hint: { zh: '请刷新页面后重试，或更换最新版浏览器。', en: 'Reload the page and retry, or use a current browser.' },
        },
      }));
      return;
    }

    worker.onmessage = (event: MessageEvent<CodeGenResponse>) => {
      const response = event.data;
      const pending = pendingRef.current;
      if (!pending || pending.id !== response.id) return;

      pendingRef.current = null;
      setState((previous) => {
        if (response.ok) {
          return {
            ...previous,
            isGenerating: false,
            durationMs: response.durationMs,
            nodeCount: response.nodeCount,
            code: response.code,
            codeLanguage: pending.language,
            genError: null,
          };
        }
        return {
          ...previous,
          isGenerating: false,
          durationMs: response.durationMs,
          nodeCount: response.nodeCount,
          code: '',
          codeLanguage: pending.language,
          genError: { ...response.error, source: pending.json },
        };
      });
    };

    worker.onerror = () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      lastRequestKeyRef.current = '';
      setState((previous) => ({
        ...previous,
        isGenerating: false,
        code: '',
        genError: {
          message: { zh: '代码生成线程异常。', en: 'The code generation worker failed.' },
          hint: {
            zh: '请刷新页面后重试；如果问题持续出现，请尝试更换浏览器。',
            en: 'Reload the page and retry; switch browsers if the problem persists.',
          },
          source: pending?.json,
        },
      }));
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current = null;
      lastRequestKeyRef.current = '';
    };
  }, []);

  const requestGeneration = useCallback((json: string, options: CodeGenOptions, force = false) => {
    const worker = workerRef.current;
    const key = `${JSON.stringify(options)}::${json}`;

    if (!json.trim()) {
      requestIdRef.current += 1;
      pendingRef.current = null;
      lastRequestKeyRef.current = '';
      setState((previous) => ({
        ...previous,
        isGenerating: false,
        code: '',
        codeLanguage: null,
        nodeCount: 0,
        durationMs: null,
        genError: null,
      }));
      return;
    }

    if (!worker) return;
    if (!force && key === lastRequestKeyRef.current) return;

    lastRequestKeyRef.current = key;
    const id = requestIdRef.current + 1;
    requestIdRef.current = id;
    pendingRef.current = { id, language: options.language, json };
    setState((previous) => ({ ...previous, isGenerating: true, genError: null }));

    const request: CodeGenRequest = { id, json, options };
    worker.postMessage(request);
  }, []);

  return { ...state, requestGeneration, invalidate, resetOutput };
}
