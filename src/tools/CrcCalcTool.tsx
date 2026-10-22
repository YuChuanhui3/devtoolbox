import { useMemo, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Panel } from '@/components/ui/Panel';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { ToolError, toToolError } from '@/lib/errors';
import { CRC_PRESETS, crcCalculate, crcHex } from '@/lib/crc';

type InputKind = 'text' | 'hex';

function hexToBytesStrict(value: string): Uint8Array {
  const cleaned = value.replace(/[\s,;]+/g, '');
  if (cleaned.length % 2 !== 0) {
    throw new ToolError({
      zh: 'HEX 长度应为偶数，每两个字符表示一个字节。',
      en: 'HEX length must be even — every two characters encode one byte.',
    });
  }
  if (cleaned && !/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new ToolError({
      zh: 'HEX 只允许 0-9 与 A-F。',
      en: 'HEX allows only 0-9 and A-F.',
    });
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export default function CrcCalcTool() {
  const { t } = useI18n();
  const [presetName, setPresetName] = useState(CRC_PRESETS[0].name);
  const [inputKind, setInputKind] = useState<InputKind>('text');
  const [input, setInput] = useState('123456789');

  const computed = useMemo<{ hex: string; dec: number } | { error: Localized } | null>(() => {
    try {
      if (!input.trim()) return null;
      const bytes =
        inputKind === 'text' ? new TextEncoder().encode(input) : hexToBytesStrict(input.trim());
      const spec = CRC_PRESETS.find((item) => item.name === presetName) ?? CRC_PRESETS[0];
      return { hex: crcHex(bytes, spec), dec: crcCalculate(bytes, spec) };
    } catch (error) {
      return { error: toToolError(error).localized } as const;
    }
  }, [input, inputKind, presetName]);

  const error = computed && 'error' in computed ? computed.error : null;
  const digest = computed && 'hex' in computed ? computed : null;

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: 'CRC 校验计算', en: 'CRC checksum calculator' })}
        subtitle={t({ zh: '查位运算实现，支持文本（UTF-8）与十六进制输入', en: 'Table-driven implementation, supporting text (UTF-8) and hexadecimal input' })}
        bodyClassName="space-y-3 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            aria-label={t({ zh: 'CRC 预设', en: 'CRC preset' })}
            className="h-8 text-xs"
            wrapperClassName="w-52"
          >
            {CRC_PRESETS.map((preset) => (
              <option key={preset.name} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </Select>
          <Segmented
            value={inputKind}
            onChange={setInputKind}
            ariaLabel={t({ zh: '输入类型', en: 'Input type' })}
            options={[
              { value: 'text', label: t({ zh: '文本', en: 'Text' }) },
              { value: 'hex', label: t({ zh: '十六进制', en: 'Hex' }) },
            ]}
          />
        </div>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          mono
          spellCheck={false}
          placeholder={
            inputKind === 'text'
              ? t({ zh: '输入要计算 CRC 的文本', en: 'Enter text to compute the CRC over' })
              : t({ zh: '输入十六进制字节，例如 31 32 33 34 35 36 37 38 39（空格可选）', en: 'Enter hex bytes, e.g. 31 32 33 34 35 36 37 38 39 (spaces optional)' })
          }
        />
        {error ? <ToolAlert tone="error" title={error} /> : null}
      </Panel>

      {digest ? (
        <Panel title={t({ zh: '结果', en: 'Result' })} subtitle={presetName} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {[
              { label: t({ zh: 'CRC（十六进制）', en: 'CRC (hex)' }), value: digest.hex },
              { label: t({ zh: 'CRC（十进制）', en: 'CRC (decimal)' }), value: String(digest.dec) },
            ].map((row) => (
              <li key={row.label} className="flex items-center gap-3 px-4 py-3">
                <span className="w-32 shrink-0 text-xs text-ink-3">{row.label}</span>
                <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">{row.value}</code>
                <CopyIconButton text={row.value} label={t({ zh: `复制${row.label}`, en: `Copy ${row.label}` })} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '“123456789” 是业界通用校验串：CRC-32 = CBF43926、MODBUS = 4B37、XMODEM = 31C3，可用于自检工具正确性。计算全部在本地完成。',
          en: '“123456789” is the industry check string: CRC-32 = CBF43926, MODBUS = 4B37, XMODEM = 31C3 — use it to self-verify the tool. All computation runs locally.',
        })}
      </p>
    </div>
  );
}
