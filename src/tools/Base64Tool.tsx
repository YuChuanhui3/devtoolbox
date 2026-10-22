import { useRef, useState } from 'react';
import { Binary, FileUp, Upload } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { TransformTool } from '@/components/tool/TransformTool';
import { CopyButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { base64ToText, textToBase64 } from '@/lib/base64';
import { formatBytes } from '@/lib/number';
import { ToolError } from '@/lib/errors';

type Mode = 'encode' | 'decode';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ENCODE_SAMPLE = 'Hello, 世界 👋';
const DECODE_SAMPLE = 'SGVsbG8sIOS4lueVjCDwn5GL';

interface FileResult {
  name: string;
  size: number;
  mime: string;
  base64: string;
}

export default function Base64Tool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('encode');
  const [urlSafe, setUrlSafe] = useState(false);
  const [stripPadding, setStripPadding] = useState(false);
  const [fileResult, setFileResult] = useState<FileResult | null>(null);
  const [fileError, setFileError] = useState<Localized | null>(null);
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEncode = mode === 'encode';

  const handleFile = (file: File) => {
    setFileError(null);
    if (file.size > MAX_FILE_SIZE) {
      setFileError({ zh: '文件不能超过 10MB，请选择更小的文件。', en: 'Files must be under 10MB. Pick a smaller file.' });
      return;
    }

    setIsReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = String(reader.result ?? '');
        const commaIndex = dataUrl.indexOf(',');
        if (commaIndex < 0) {
          throw new ToolError(
            { zh: '文件读取失败', en: 'File read failed' },
            { zh: '无法解析文件内容。', en: 'Unable to parse the file content.' },
          );
        }
        setFileResult({
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          base64: dataUrl.slice(commaIndex + 1),
        });
      } catch (error) {
        setFileError(error instanceof ToolError ? error.localized : t({ zh: '文件读取失败', en: 'File read failed' }));
      } finally {
        setIsReading(false);
      }
    };
    reader.onerror = () => {
      setFileError({ zh: '文件读取失败，请重试。', en: 'File read failed. Try again.' });
      setIsReading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <TransformTool
        transform={(input) =>
          isEncode ? textToBase64(input, urlSafe, stripPadding) : base64ToText(input)
        }
        sample={isEncode ? ENCODE_SAMPLE : DECODE_SAMPLE}
        inputLabel={isEncode ? { zh: '文本输入', en: 'Text input' } : { zh: 'Base64 输入', en: 'Base64 input' }}
        outputLabel={isEncode ? { zh: 'Base64 结果', en: 'Base64 output' } : { zh: '解码文本', en: 'Decoded text' }}
        inputPlaceholder={isEncode ? { zh: '输入需要编码的文本，支持中文与 Emoji', en: 'Enter text to encode; Chinese and emoji supported' } : { zh: '粘贴 Base64 文本', en: 'Paste Base64 text' }}
        outputFilename={isEncode ? 'base64.txt' : 'decoded.txt'}
        successMessage={isEncode ? { zh: '编码完成', en: 'Encoded' } : { zh: '解码完成', en: 'Decoded' }}
        live={false}
        onSwap={() => setMode(isEncode ? 'decode' : 'encode')}
        options={
          <>
            <Segmented
              value={mode}
              onChange={setMode}
              ariaLabel={t({ zh: 'Base64 模式', en: 'Base64 mode' })}
              options={[
                { value: 'encode', label: t({ zh: '编码', en: 'Encode' }) },
                { value: 'decode', label: t({ zh: '解码', en: 'Decode' }) },
              ]}
            />
            {isEncode ? (
              <>
                <Checkbox checked={urlSafe} onChange={setUrlSafe} label="URL Safe" className="text-xs" />
                <Checkbox
                  checked={stripPadding}
                  onChange={setStripPadding}
                  label={t({ zh: '去除 = 填充', en: 'Strip = padding' })}
                  className="text-xs"
                />
              </>
            ) : (
              <span className="hidden text-xs text-ink-3 sm:inline">
                {t({ zh: '自动忽略空格与换行', en: 'Spaces and line breaks are ignored' })}
              </span>
            )}
          </>
        }
        helpText={t({
          zh: '编码使用 UTF-8；解码失败时会提示非法字符或非文本内容',
          en: 'Encoding uses UTF-8; decoding failures report invalid characters or non-text content.',
        })}
      />

      <Panel
        title={t({ zh: '文件转 Base64', en: 'File to Base64' })}
        subtitle={t({ zh: '文件仅在浏览器本地读取，不会上传服务器', en: 'Files are read locally in the browser and never uploaded' })}
        actions={
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isReading}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {isReading ? t({ zh: '读取中…', en: 'Reading…' }) : t({ zh: '选择文件', en: 'Choose file' })}
          </Button>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = '';
          }}
        />

        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface-2/40 px-4 py-8 text-center transition-colors duration-300 hover:border-accent/50 hover:bg-accent-soft/30"
          >
            <FileUp className="h-6 w-6 text-ink-3" aria-hidden="true" />
            <p className="mt-2 text-sm text-ink-2">
              {t({ zh: '拖拽文件到此处，或点击选择', en: 'Drop a file here, or click to choose' })}
            </p>
            <p className="mt-1 text-[11px] text-ink-3">
              {t({ zh: '支持任意文件类型，单个文件不超过 10MB', en: 'Any file type, up to 10MB each' })}
            </p>
          </div>

          {fileError ? <ToolAlert tone="error" title={fileError} /> : null}

          {fileResult ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                  <Binary className="h-3.5 w-3.5" aria-hidden="true" />
                  {fileResult.name}
                </span>
                <span>{formatBytes(fileResult.size)}</span>
                <span>{fileResult.mime}</span>
                <span className="ml-auto flex gap-1.5">
                  <CopyButton text={fileResult.base64} label={{ zh: '复制 Base64', en: 'Copy Base64' }} />
                  <DownloadButton
                    filename={`${fileResult.name}.base64.txt`}
                    content={fileResult.base64}
                  />
                </span>
              </div>
              <textarea
                readOnly
                value={fileResult.base64}
                aria-label={t({ zh: '文件 Base64 结果', en: 'File Base64 result' })}
                className="code-scroll h-32 w-full resize-y rounded-xl border border-line bg-code-bg p-3 font-mono text-[12px] leading-5 text-ink outline-none"
              />
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
