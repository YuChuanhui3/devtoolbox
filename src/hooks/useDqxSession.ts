import { useCallback, useMemo, useRef, useState } from 'react';
import { FrameAssembler, type AssembleEvent, type SessionView } from '@/lib/qr-transfer';

/** 扫码/解码得到的帧统一喂给这个会话收集器；跨 tab 共享，重组结果即时同步。 */
export function useDqxSession() {
  const assemblerRef = useRef<FrameAssembler | null>(null);
  if (!assemblerRef.current) assemblerRef.current = new FrameAssembler();
  const assembler = assemblerRef.current;

  const [event, setEvent] = useState<AssembleEvent | null>(null);
  // 完成一次的载荷留在这里：发送端循环重播时后续帧都是 duplicate/ignored，不能让事件类型把结果卡片刷掉。
  const [result, setResult] = useState<{ sid: string; payload: Uint8Array } | null>(null);

  const accept = useCallback(
    (text: string | null) => {
      if (!text) return;
      const next = assembler.push(text);
      setEvent(next);
      if (next.kind === 'complete') setResult({ sid: next.session.sid, payload: next.payload });
      else if (next.kind === 'mismatch') setResult((current) => (current?.sid === next.session.sid ? null : current));
    },
    [assembler],
  );

  const reset = useCallback(() => {
    assembler.reset();
    setEvent(null);
    setResult(null);
  }, [assembler]);

  // event 变化即重算：FrameAssembler 原地变更，必须靠事件引用驱动视图更新。
  const sessions = useMemo(() => assembler.sessionsList(), [assembler, event]);

  const complete = useMemo<{ view: SessionView; payload: Uint8Array } | null>(() => {
    if (!result) return null;
    const view = sessions.find((candidate) => candidate.sid === result.sid && candidate.missingCount === 0);
    return view ? { view, payload: result.payload } : null;
  }, [sessions, result]);

  return { assembler, accept, reset, event, sessions, complete };
}

export type DqxSession = ReturnType<typeof useDqxSession>;
