import { useMemo, useRef, useState } from 'react';
import { FileUp, Hash, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { InputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { ToolAlert } from '@/components/tool/ToolAlert';
import {
  ActionBar,
  ClearButton,
  CopyButton,
  CopyIconButton,
  DownloadButton,
  SampleButton,
} from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ToolError } from '@/lib/errors';
import {
  DEFAULT_HASH_ALGORITHMS,
  FAMILY_LABELS,
  HASH_ALGORITHMS,
  hashInputToAlgorithms,
  uppercaseRows,
  type HashAlgorithm,
} from '@/lib/hash';
import { countTextStats } from '@/lib/text';

const SAMPLE = 'Hello, DevToolbox 👋';
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const SLOW_FILE_BYTES = 20 * 1024 * 1024;

type Mode = 'text' | 'file' | 'email';

interface FileState {
  name: string;
  size: number;
  bytes: Uint8Array;
}

const FAMILY_GROUPS: { family: string; items: typeof HASH_ALGORITHMS }[] = (() => {
  const families = Array.from(new Set(HASH_ALGORITHMS.map((info) => info.family)));
  return families.map((family) => ({
    family,
    items: HASH_ALGORITHMS.filter((info) => info.family === family),
  }));
})();

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(2)} MB`;
}

export default function HashTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('text');
  const [input, setInput] = useState('');
  const [algorithms, setAlgorithms] = useState<HashAlgorithm[]>(DEFAULT_HASH_ALGORITHMS);
  const [uppercase, setUppercase] = useState(false);
  const [shakeBytes, setShakeBytes] = useState('');
  const [file, setFile] = useState<FileState | null>(null);
  const [fileError, setFileError] = useState<Localized | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedInput = useDebouncedValue(input, 180);
  const usesShake = algorithms.includes('shake128') || algorithms.includes('shake256');

  const computed = useMemo<{ rows: { id: string; label: string; value: string }[]; error: Localized | null }>(() => {
    if (algorithms.length === 0) {
      return { rows: [], error: { zh: '请至少勾选一种摘要算法。', en: 'Select at least one digest algorithm.' } };
    }
    let source: string | Uint8Array;
    if (mode === 'text') {
      if (!debouncedInput) return { rows: [], error: null };
      source = debouncedInput;
    } else if (mode === 'email') {
      const trimmed = debouncedInput.trim().toLowerCase();
      if (!trimmed) return { rows: [], error: null };
      source = trimmed;
    } else {
      if (!file) return { rows: [], error: fileError };
      source = file.bytes;
    }
    const options = shakeBytes.trim()
      ? { shakeBytes: Number(shakeBytes.trim()) }
      : {};
    try {
      const rows = hashInputToAlgorithms(source, algorithms, options);
      return { rows: uppercase ? uppercaseRows(rows) : rows, error: null };
    } catch (error) {
      if (error instanceof ToolError) return { rows: [], error: error.localized };
      return { rows: [], error: { zh: '计算失败', en: 'Computation failed' } };
    }
  }, [mode, debouncedInput, file, fileError, algorithms, uppercase, shakeBytes]);

  const stats = useMemo(() => countTextStats(input), [input]);
  const allText = computed.rows.map((row) => `${row.label}: ${row.value}`).join('\n');

  const toggleAlgorithm = (id: HashAlgorithm) => {
    setAlgorithms((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const handleFile = async (picked: File | null) => {
    setFileError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError({
        zh: `文件过大（${formatBytes(picked.size)}），为保证浏览器流畅请计算 ${formatBytes(MAX_FILE_BYTES)} 以内的文件。`,
        en: `File too large (${formatBytes(picked.size)}). For smooth browsing, keep files under ${formatBytes(MAX_FILE_BYTES)}.`,
      });
      return;
    }
    const buffer = await picked.arrayBuffer();
    setFile({ name: picked.name, size: picked.size, bytes: new Uint8Array(buffer) });
  };

  const digestPanel = (
    <Panel
      title={t({ zh: '摘要结果', en: 'Digests' })}
      subtitle={
        mode === 'email'
          ? debouncedInput
            ? t({
                zh: `实际计算对象：${debouncedInput.trim().toLowerCase()}`,
                en: `Hashing: ${debouncedInput.trim().toLowerCase()}`,
              })
            : t({ zh: '输入邮箱后自动计算', en: 'Calculates as you type an email address' })
          : mode === 'file'
            ? computed.rows.length
              ? t({ zh: '文件摘要计算完成', en: 'File digests computed' })
              : t({ zh: '选择文件后自动计算', en: 'Calculates after you pick a file' })
            : computed.rows.length
              ? t({ zh: '实时计算完成', en: 'Calculated live' })
              : t({ zh: '输入文本后自动计算', en: 'Calculates as you type' })
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-line">
        {computed.rows.length === 0 ? (
          <li className="flex min-h-[240px] items-center justify-center px-4 text-xs text-ink-3">
            {computed.error ? t(computed.error) : t({ zh: '摘要结果将在这里显示', en: 'Digests will appear here' })}
          </li>
        ) : (
          computed.rows.map((row) => (
            <li key={row.id} className="flex items-start gap-3 px-4 py-3.5">
              <span className="mt-0.5 inline-flex w-24 shrink-0 items-center gap-1 text-xs font-medium text-ink-2">
                <Hash className="h-3 w-3 text-ink-3" aria-hidden="true" />
                {row.label}
              </span>
              <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5 text-ink">
                {row.value}
              </code>
              <CopyIconButton
                text={row.value}
                label={t({ zh: `复制 ${row.label}`, en: `Copy ${row.label}` })}
              />
            </li>
          ))
        )}
      </ul>
    </Panel>
  );

  return (
    <div className="space-y-4">
      <ActionBar>
        <Segmented
          value={mode}
          onChange={(value) => setMode(value)}
          ariaLabel={t({ zh: '哈希计算模式', en: 'Hash mode' })}
          options={[
            { value: 'text', label: t({ zh: '文本', en: 'Text' }) },
            { value: 'file', label: t({ zh: '文件', en: 'File' }) },
            { value: 'email', label: 'Email/Gravatar' },
          ]}
        />
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <span className="flex items-center gap-2 px-1 text-xs text-ink-3">
          {t({ zh: '大写输出', en: 'Uppercase' })}
          <Switch checked={uppercase} onChange={setUppercase} label={t({ zh: '切换大写输出', en: 'Toggle uppercase output' })} />
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {mode !== 'file' ? (
            <SampleButton onClick={() => setInput(mode === 'email' ? 'User@Example.com' : SAMPLE)} />
          ) : null}
          <ClearButton
            onClick={() => {
              setInput('');
              void handleFile(null);
            }}
          />
          <CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} disabled={!allText} />
          <DownloadButton filename="hashes.txt" content={allText} disabled={!allText} />
        </div>
      </ActionBar>

      <Panel
        title={t({ zh: '摘要算法', en: 'Digest algorithms' })}
        subtitle={t({
          zh: '勾选需要计算的算法，MD2/MD4/RIPEMD-160/SHA-3/Keccak/SHAKE 均为浏览器本地实现',
          en: 'Select the algorithms to compute; MD2/MD4/RIPEMD-160/SHA-3/Keccak/SHAKE all run locally in the browser',
        })}
        bodyClassName="space-y-2.5"
      >
        <div className="space-y-2">
          {FAMILY_GROUPS.map((group) => (
            <div key={group.family} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="w-24 shrink-0 text-xs font-medium text-ink-3">
                {t(FAMILY_LABELS[group.family] ?? { zh: group.family, en: group.family })}
              </span>
              {group.items.map((info) => (
                <Checkbox
                  key={info.id}
                  checked={algorithms.includes(info.id)}
                  onChange={() => toggleAlgorithm(info.id)}
                  label={info.label}
                  className="text-xs"
                />
              ))}
            </div>
          ))}
        </div>
        {usesShake ? (
          <label className="flex items-center gap-2 text-xs text-ink-3">
            {t({ zh: 'SHAKE 可变输出长度（字节）', en: 'SHAKE output length (bytes)' })}
            <Input
              value={shakeBytes}
              onChange={(event) => setShakeBytes(event.target.value)}
              inputMode="numeric"
              placeholder={t({ zh: '默认 32 / 64', en: 'Default 32 / 64' })}
              aria-label={t({ zh: 'SHAKE 输出长度（字节）', en: 'SHAKE output length (bytes)' })}
              className="h-8 w-32 text-xs"
            />
          </label>
        ) : null}
      </Panel>

      {mode === 'file' ? (
        <div className="space-y-4">
        <Panel
          title={t({ zh: '本地文件', en: 'Local file' })}
          subtitle={t({
            zh: '文件内容只在浏览器内读取计算，不会上传到任何服务器',
            en: 'File content is read and hashed in the browser only, never uploaded to any server',
          })}
          bodyClassName="space-y-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '选择文件', en: 'Choose file' })}
            </button>
            {file ? (
              <>
                <span className="min-w-0 truncate text-xs text-ink">
                  {t({ zh: `${file.name}（${formatBytes(file.size)}）`, en: `${file.name} (${formatBytes(file.size)})` })}
                </span>
                <button
                  type="button"
                  onClick={() => void handleFile(null)}
                  className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  {t({ zh: '清除', en: 'Clear' })}
                </button>
              </>
            ) : (
              <span className="text-xs text-ink-3">{t({ zh: '尚未选择文件', en: 'No file selected' })}</span>
            )}
          </div>
          {fileError || computed.error ? (
            <ToolAlert tone="error" title={fileError ?? computed.error ?? ''} />
          ) : null}
          {file && file.size > SLOW_FILE_BYTES ? (
            <ToolAlert
              tone="info"
              title={{ zh: '文件较大，计算可能需要几秒', en: 'Large file — this may take a few seconds' }}
              hint={{
                zh: '摘要在浏览器主线程内计算，期间页面可能短暂卡顿；勾选的算法越少、速度越快。',
                en: 'Digests are computed on the browser main thread, so the page may stall briefly; fewer selected algorithms run faster.',
              }}
            />
          ) : null}
        </Panel>
          {digestPanel}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <InputPanel
            label={mode === 'email' ? { zh: '邮箱地址', en: 'Email address' } : { zh: '文本输入', en: 'Text input' }}
            value={input}
            onChange={setInput}
            placeholder={
              mode === 'email'
                ? { zh: '输入邮箱地址，自动转小写后计算 Gravatar 哈希', en: 'Enter an email address; lowercased automatically for the Gravatar hash' }
                : { zh: '输入需要计算摘要的文本，结果会实时更新', en: 'Enter the text to digest; results update live' }
            }
            footer={
              mode === 'text' ? (
                <StatsBar
                  items={[
                    { label: t({ zh: '字符', en: 'Chars' }), value: stats.chars },
                    { label: t({ zh: 'UTF-8 字节', en: 'UTF-8 bytes' }), value: stats.bytes },
                    { label: t({ zh: '行数', en: 'Lines' }), value: stats.lines },
                  ]}
                />
              ) : undefined
            }
          />

          {digestPanel}
        </div>
      )}

      {mode === 'text' && computed.error ? (
        <ToolAlert tone="error" title={computed.error} />
      ) : null}

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '哈希摘要不可逆，无法通过摘要还原原文（不存在合法的“MD5 解密”）。文本与文件均在本机计算，不会上传。',
          en: 'Hash digests are one-way — the original text cannot be recovered from them (there is no legitimate "MD5 decryption"). Text and files are computed on your machine and never uploaded.',
        })}
      </p>
    </div>
  );
}
