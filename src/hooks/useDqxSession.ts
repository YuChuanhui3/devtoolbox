import { useCallback, useMemo, useRef, useState } from 'react';
import { FrameAssembler, type AssembleEvent } from '@/lib/qr-transfer';

/** 扫码/解码得到的帧统一喂给这个会话收集器；跨 tab 共享，重组结果即时同步。 */
export function useDqxSession() {
  const assemblerRef = useRef<FrameAssembler | null>(null);
  if (!assemblerRef.current) assemblerRef.current = new FrameAssembler();
  const assembler = assemblerRef.current;

  const [event, setEvent] = useState<AssembleEvent | null>(null);

  const accept = useCallback(
    (text: string | null) => {
      if (!text) return;
      setEvent(assembler.push(text));
    },
    [assembler],
  );

  const reset = useCallback(() => {
    assembler.reset();
    setEvent(null);
  }, [assembler]);

  // event 变化即重算：FrameAssembler 原地变更，必须靠事件引用驱动视图更新。
  const sessions = useMemo(() => assembler.sessionsList(), [assembler, event]);

  return { assembler, accept, reset, event, sessions };
}

export type DqxSession = ReturnType<typeof useDqxSession>;
