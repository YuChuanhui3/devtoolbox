import { useCallback, useRef, useState } from 'react';
import { ToolError, toToolError } from '@/lib/errors';
import { trackToolExecution } from '@/lib/analytics';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useAppStore } from '@/store/appStore';

const NOOP = () => {};

export interface RunOptions {
  success?: string;
  /** 失败时保留上一次结果，默认清空以避免展示过期结果。 */
  keepOutputOnError?: boolean;
}

export interface ToolIO {
  input: string;
  output: string;
  error: ToolError | null;
  notice: string | null;
  isRunning: boolean;
  setInput: (value: string) => void;
  setOutput: (value: string) => void;
  setError: (error: ToolError | null) => void;
  setNotice: (notice: string | null) => void;
  run: (
    handler: (input: string) => string | Promise<string>,
    options?: RunOptions,
  ) => Promise<boolean>;
  runWithValue: (
    handler: (input: string) => string | Promise<string>,
    value: string,
    options?: RunOptions,
  ) => Promise<boolean>;
  swap: () => void;
  clear: () => void;
  reset: (value?: string) => void;
}

export interface ToolIOOptions {
  /** 工具箱共享输入面板：输入由父组件持有，本实例不恢复初值、不回写草稿。 */
  draftless?: boolean;
}

export function useToolIO(initialInput = '', options: ToolIOOptions = {}): ToolIO {
  const { draftless = false } = options;
  const toolContext = useToolContext();
  const restoredInput = draftless ? '' : toolContext?.initialInput ?? '';
  const [input, setInputState] = useState(() => restoredInput || initialInput);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<ToolError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { markDirty: markDraftDirtyReal } = useDraftAutosave(
    () => input || null,
    [input],
    () => {
      setInputState('');
      setOutput('');
      setError(null);
      setNotice(null);
    },
  );
  const markDraftDirty = draftless ? NOOP : markDraftDirtyReal;

  // 异步 run 的失效令牌：clear/reset/swap 或新一轮 run 之后，迟到的旧结果不得回写。
  const runSeqRef = useRef(0);

  const setInput = useCallback(
    (value: string) => {
      markDraftDirty();
      setInputState(value);
      setError(null);
      setNotice(null);
    },
    [markDraftDirty],
  );

  const execute = useCallback(
    async (
      handler: (input: string) => string | Promise<string>,
      value: string,
      options?: RunOptions,
    ) => {
      if (isRunning) return false;
      const seq = runSeqRef.current + 1;
      runSeqRef.current = seq;
      setIsRunning(true);
      setError(null);
      setNotice(null);

      const toolId = toolContext?.tool.id;
      const track = () => Boolean(toolId) && useAppStore.getState().analyticsEnabled;

      try {
        const result = await handler(value);
        if (runSeqRef.current !== seq) return false; // 结果已失效（用户清空/重置/重新运行），不回写
        setOutput(result);
        if (options?.success) setNotice(options.success);
        if (track()) trackToolExecution(toolId!, true);
        return true;
      } catch (caught) {
        if (runSeqRef.current === seq) {
          setError(toToolError(caught));
          if (!options?.keepOutputOnError) setOutput('');
        }
        if (track()) trackToolExecution(toolId!, false);
        return false;
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, toolContext],
  );

  const run = useCallback(
    (handler: (input: string) => string | Promise<string>, options?: RunOptions) =>
      execute(handler, input, options),
    [execute, input],
  );

  const runWithValue = useCallback(
    (
      handler: (input: string) => string | Promise<string>,
      value: string,
      options?: RunOptions,
    ) => execute(handler, value, options),
    [execute],
  );

  const swap = useCallback(() => {
    runSeqRef.current += 1;
    markDraftDirty();
    setInputState(output);
    setOutput(input);
    setError(null);
    setNotice(null);
  }, [input, output, markDraftDirty]);

  const clear = useCallback(() => {
    runSeqRef.current += 1;
    markDraftDirty();
    setInputState('');
    setOutput('');
    setError(null);
    setNotice(null);
  }, [markDraftDirty]);

  const reset = useCallback(
    (value = '') => {
      runSeqRef.current += 1;
      markDraftDirty();
      setInputState(value);
      setOutput('');
      setError(null);
      setNotice(null);
    },
    [markDraftDirty],
  );

  return {
    input,
    output,
    error,
    notice,
    isRunning,
    setInput,
    setOutput,
    setError,
    setNotice,
    run,
    runWithValue,
    swap,
    clear,
    reset,
  };
}
