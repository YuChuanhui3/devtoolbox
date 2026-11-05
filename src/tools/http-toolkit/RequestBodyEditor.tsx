import { useRef, useState } from 'react';
import { Paperclip, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { formatBytes } from '@/lib/number';
import { dropFile, holdFile, newFileRef, readFile } from '@/lib/apiworkbench/files';
import type { WbBody, WbBodyMode, WbPart } from '@/lib/apiworkbench/types';

/** 名称 / 值 / 删除。 */
const PART_COLS = 'grid min-w-0 items-center gap-1.5 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]';

const MODES: { value: WbBodyMode; zh: string; en: string }[] = [
  { value: 'none', zh: '无', en: 'None' },
  { value: 'json', zh: 'JSON', en: 'JSON' },
  { value: 'text', zh: '纯文本', en: 'Text' },
  { value: 'form', zh: '表单', en: 'Form' },
  { value: 'multipart', zh: 'multipart', en: 'multipart' },
  { value: 'graphql', zh: 'GraphQL', en: 'GraphQL' },
];

interface Props {
  body: WbBody;
  /** 代理通道不携带 multipart，UI 要提前拦住而不是发出去再失败。 */
  proxying: boolean;
  onChange: (next: WbBody) => void;
}

export function RequestBodyEditor({ body, proxying, onChange }: Props) {
  const { t } = useI18n();
  const parts = body.multipart ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);

  const patchParts = (next: WbPart[]) => onChange({ ...body, multipart: next });

  const setMode = (mode: WbBodyMode) => {
    if (mode === body.mode) return;
    const next: WbBody = { ...body, mode };
    if (mode === 'multipart' && !parts.length) next.multipart = [{ key: '', type: 'text', value: '' }];
    if (mode === 'graphql' && !body.graphql) next.graphql = { query: '', variables: '', operationName: '' };
    onChange(next);
  };

  const pickFile = (index: number, file: File) => {
    const previous = parts[index];
    if (previous?.fileRef) dropFile(previous.fileRef);
    const ref = newFileRef();
    holdFile(ref, file);
    patchParts(parts.map((p, i) => (i === index ? { ...p, type: 'file', value: '', fileName: file.name, fileSize: file.size, mime: file.type, fileRef: ref } : p)));
  };

  const clearFile = (index: number) => {
    dropFile(parts[index]?.fileRef);
    patchParts(parts.map((p, i) => (i === index ? { ...p, type: 'text', value: '', fileName: undefined, fileSize: undefined, mime: undefined, fileRef: undefined } : p)));
  };

  const graphql = body.graphql ?? { query: '', variables: '', operationName: '' };
  const plainDisabled = body.mode === 'none';

  return (
    <div className="min-w-0 space-y-2">
      <Segmented<WbBodyMode>
        size="sm"
        value={body.mode}
        onChange={setMode}
        ariaLabel={t({ zh: '请求体类型', en: 'Body type' })}
        options={MODES.map((m) => ({ value: m.value, label: t({ zh: m.zh, en: m.en }) }))}
      />

      {body.mode === 'none' ? (
        <p className="text-xs text-ink-3">{t({ zh: '不发送请求体。GET 与 HEAD 永远不会带体。', en: 'No body is sent. GET and HEAD never carry one.' })}</p>
      ) : null}

      {body.mode === 'json' || body.mode === 'text' || body.mode === 'form' ? (
        <>
          <Textarea
            value={body.text}
            onChange={(e) => onChange({ ...body, text: e.target.value })}
            rows={5}
            mono
            disabled={plainDisabled}
            placeholder={body.mode === 'form' ? 'a=1&b=2' : '{"key": "value"}'}
            aria-label={t({ zh: '请求体', en: 'Request body' })}
          />
          <p className="text-[11px] text-ink-3">
            {body.mode === 'form'
              ? t({ zh: '按 application/x-www-form-urlencoded 原样发送，值里带 {{变量}} 会先插值。', en: 'Sent verbatim as application/x-www-form-urlencoded; {{variables}} are interpolated first.' })
              : t({ zh: '代理通道不支持带请求体的方法；跨域调试请走直连或本地 Mock。', en: 'Proxy channels do not carry bodies on non-GET methods — use direct or local mock for cross-origin debugging.' })}
          </p>
        </>
      ) : null}

      {body.mode === 'multipart' ? (
        <>
          {proxying ? (
            <ToolAlert
              tone="warning"
              title={t({ zh: '代理通道不发送 multipart', en: 'Proxy channels do not carry multipart' })}
              hint={t({ zh: '切到直连，或改用本地 Mock 再发。', en: 'Switch to direct, or use the local mock.' })}
            />
          ) : null}
          <div className={`${PART_COLS} hidden text-[11px] font-medium text-ink-3 sm:grid`}>
            <span>{t({ zh: '字段名', en: 'Name' })}</span>
            <span>{t({ zh: '值 / 文件', en: 'Value / file' })}</span>
            <span className="justify-self-end">{t({ zh: '删除', en: 'Remove' })}</span>
          </div>
          {parts.map((part, index) => {
            const missing = part.type === 'file' && part.fileRef && !readFile(part.fileRef);
            return (
              <div key={index} className="min-w-0 space-y-1">
                <div className={PART_COLS}>
                  <Input
                    size="sm"
                    value={part.key}
                    onChange={(e) => patchParts(parts.map((p, i) => (i === index ? { ...p, key: e.target.value } : p)))}
                    placeholder="name"
                    mono
                    aria-label={t({ zh: `字段名 ${index + 1}`, en: `Field name ${index + 1}` })}
                  />
                  {part.type === 'file' ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => { setPickingIndex(index); fileInputRef.current?.click(); }}>
                        <Paperclip className="h-3 w-3" aria-hidden="true" />
                        {t({ zh: '选择文件', en: 'Choose file' })}
                      </Button>
                      <span className="min-w-0 truncate text-[11px] text-ink-2" title={part.fileName}>
                        {part.fileName ? `${part.fileName} · ${formatBytes(part.fileSize ?? 0)}` : t({ zh: '未选择', en: 'none' })}
                      </span>
                      {part.fileName ? (
                        <Button variant="ghost" size="sm" onClick={() => clearFile(index)} aria-label={t({ zh: '移除文件', en: 'Remove file' })}>
                          <X className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <Input
                      size="sm"
                      value={part.value}
                      onChange={(e) => patchParts(parts.map((p, i) => (i === index ? { ...p, value: e.target.value } : p)))}
                      placeholder="value 或 {{var}}"
                      mono
                      aria-label={t({ zh: `字段值 ${index + 1}`, en: `Field value ${index + 1}` })}
                    />
                  )}
                  <Button variant="ghost" size="sm" className="justify-self-end" onClick={() => { dropFile(part.fileRef); patchParts(parts.filter((_, i) => i !== index)); }} aria-label={t({ zh: '删除字段', en: 'Remove field' })}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
                {missing ? (
                  <p className="text-[11px] text-warn">
                    {t({ zh: '文件字节已不在本页内存里，发送前需要重新选择。', en: 'The bytes are no longer in this tab’s memory; pick the file again before sending.' })}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => patchParts([...parts, { key: '', type: 'text', value: '' }])}>
              <Plus className="h-3 w-3" aria-hidden="true" />
              {t({ zh: '文本字段', en: 'Text field' })}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => patchParts([...parts, { key: '', type: 'file', value: '' }])}>
              <Paperclip className="h-3 w-3" aria-hidden="true" />
              {t({ zh: '文件字段', en: 'File field' })}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && pickingIndex !== null) pickFile(pickingIndex, file);
              e.target.value = '';
              setPickingIndex(null);
            }}
          />
          <p className="text-[11px] text-ink-3">
            {t({
              zh: '文件字节只留在本页内存：不进 localStorage，刷新或换标签就得重选；导出与共享也不会带上它。',
              en: 'File bytes stay in this tab only: never written to storage, lost on reload, and not included in exports.',
            })}
          </p>
        </>
      ) : null}

      {body.mode === 'graphql' ? (
        <div className="min-w-0 space-y-2">
          <Textarea
            value={graphql.query}
            onChange={(e) => onChange({ ...body, graphql: { ...graphql, query: e.target.value } })}
            rows={5}
            mono
            placeholder={'query Me($id: ID!) {\n  user(id: $id) { name }\n}'}
            aria-label={t({ zh: 'GraphQL Query', en: 'GraphQL query' })}
          />
          <Textarea
            value={graphql.variables}
            onChange={(e) => onChange({ ...body, graphql: { ...graphql, variables: e.target.value } })}
            rows={3}
            mono
            placeholder='{"id": "1"}'
            aria-label={t({ zh: 'GraphQL Variables', en: 'GraphQL variables' })}
          />
          <Input
            size="sm"
            value={graphql.operationName ?? ''}
            onChange={(e) => onChange({ ...body, graphql: { ...graphql, operationName: e.target.value } })}
            placeholder="operationName"
            mono
            aria-label={t({ zh: 'GraphQL 操作名', en: 'GraphQL operation name' })}
          />
          <p className="text-[11px] text-ink-3">
            {t({
              zh: '发 POST，正文为 {"query","variables","operationName"}；Variables 需是 JSON 对象，留空表示无变量。',
              en: 'Sends POST with {"query","variables","operationName"}; variables must be a JSON object, or empty for none.',
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
