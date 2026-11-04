import { useState } from 'react';
import { Import, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { CopyButton } from '@/components/tool/ToolActions';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { toToolError } from '@/lib/errors';
import { WB_METHODS } from '@/lib/apiworkbench/types';
import { parseCurlToRequest, toCurl } from '@/lib/apiworkbench/transfer';
import type { Localized } from '@/i18n/locale';
import type { WbBodyMode, WbRequest } from '@/lib/apiworkbench/types';

type Section = 'headers' | 'body' | 'auth';

interface EditorProps {
  request: WbRequest;
  onChange: (next: WbRequest) => void;
  onSend: () => void;
  onSave: () => void;
  saving: boolean;
  missing: string[];
  onImported: (req: WbRequest) => void;
}

export function RequestEditor({ request, onChange, onSend, onSave, saving, missing, onImported }: EditorProps) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('headers');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<Localized | null>(null);

  const patch = (next: Partial<WbRequest>) => onChange({ ...request, ...next });

  const doImport = () => {
    try {
      onImported(parseCurlToRequest(importText, request.name === 'New request' ? undefined : request.name));
      setImportOpen(false);
      setImportText('');
      setImportError(null);
    } catch (caught) {
      setImportError(toToolError(caught).localized);
    }
  };

  const bodyDisabled = request.body.mode === 'none';

  return (
    <div className="space-y-3">
      <Input
        value={request.name}
        onChange={(e) => patch({ name: e.target.value })}
        className="h-8 text-xs font-medium"
        aria-label={t({ zh: '请求名称', en: 'Request name' })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={request.method}
          onChange={(e) => patch({ method: e.target.value as WbRequest['method'] })}
          aria-label={t({ zh: '请求方法', en: 'Request method' })}
          className="h-9 w-28"
          wrapperClassName="w-28 shrink-0"
        >
          {WB_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
        <Input
          value={request.url}
          onChange={(e) => patch({ url: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend();
          }}
          placeholder="https://… 或 {{baseUrl}}/path"
          mono
          className="h-9 min-w-52 flex-1 text-xs"
          aria-label={t({ zh: '请求 URL', en: 'Request URL' })}
        />
        <Button variant="primary" onClick={onSend} disabled={saving}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {saving ? t({ zh: '请求中…', en: 'Requesting…' }) : t({ zh: '发送', en: 'Send' })}
        </Button>
      </div>

      {missing.length > 0 ? (
        <ToolAlert
          tone="warning"
          title={t({ zh: `未定义变量：${missing.map((m) => `{{${m}}}`).join(' ')}`, en: `Undefined variables: ${missing.map((m) => `{{${m}}}`).join(' ')}` })}
          hint={t({ zh: '在环境中定义后重新选择环境，或直接写死值。', en: 'Define them in an environment and reselect it, or inline the values.' })}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Section>
          value={section}
          onChange={setSection}
          ariaLabel={t({ zh: '请求编辑区', en: 'Request editor section' })}
          options={[
            { value: 'headers', label: `${t({ zh: '请求头', en: 'Headers' })} (${request.headers.length})` },
            { value: 'body', label: t({ zh: '请求体', en: 'Body' }) },
            { value: 'auth', label: 'Auth' },
          ]}
        />
        <span className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)}>
            <Import className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '导入 curl', en: 'Import curl' })}
          </Button>
          <CopyButton text={toCurl(request)} label={{ zh: '复制为 curl', en: 'Copy as curl' }} />
          <Button variant="secondary" size="sm" onClick={onSave}>
            {t({ zh: '保存', en: 'Save' })}
          </Button>
        </span>
      </div>

      {section === 'headers' ? (
        <div className="space-y-2">
          {request.headers.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Checkbox
                checked={row.enabled}
                onChange={(checked) =>
                  patch({ headers: request.headers.map((h, i) => (i === index ? { ...h, enabled: checked } : h)) })
                }
                label={<span className="sr-only">{t({ zh: '启用请求头', en: 'Enable header' })}</span>}
              />
              <Input
                value={row.key}
                onChange={(e) => patch({ headers: request.headers.map((h, i) => (i === index ? { ...h, key: e.target.value } : h)) })}
                placeholder="Name"
                mono
                className="h-8 w-40 text-xs"
                aria-label={t({ zh: `请求头名称 ${index + 1}`, en: `Header name ${index + 1}` })}
              />
              <Input
                value={row.value}
                onChange={(e) => patch({ headers: request.headers.map((h, i) => (i === index ? { ...h, value: e.target.value } : h)) })}
                placeholder="value 或 {{token}}"
                mono
                className="h-8 flex-1 text-xs"
                aria-label={t({ zh: `请求头值 ${index + 1}`, en: `Header value ${index + 1}` })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch({ headers: request.headers.filter((_, i) => i !== index) })}
                aria-label={t({ zh: '删除请求头', en: 'Remove header' })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => patch({ headers: [...request.headers, { key: '', value: '', enabled: true }] })}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            {t({ zh: '添加', en: 'Add' })}
          </Button>
        </div>
      ) : null}

      {section === 'body' ? (
        <div className="space-y-2">
          <Segmented<WbBodyMode>
            value={request.body.mode}
            onChange={(mode) => patch({ body: { ...request.body, mode } })}
            ariaLabel={t({ zh: '请求体类型', en: 'Body type' })}
            options={[
              { value: 'none', label: t({ zh: '无', en: 'None' }) },
              { value: 'json', label: 'JSON' },
              { value: 'text', label: t({ zh: '纯文本', en: 'Text' }) },
              { value: 'form', label: t({ zh: '表单', en: 'Form' }) },
            ]}
          />
          <Textarea
            value={request.body.text}
            onChange={(e) => patch({ body: { ...request.body, text: e.target.value } })}
            rows={5}
            mono
            disabled={bodyDisabled}
            className="text-xs"
            placeholder={request.body.mode === 'form' ? 'a=1&b=2' : '{"key": "value"}'}
            aria-label={t({ zh: '请求体', en: 'Request body' })}
          />
          <p className="text-[11px] text-ink-3">
            {t({
              zh: '代理通道不支持带请求体的方法；跨域调试请走直连或本地 Mock。',
              en: 'Proxy channels do not carry bodies on non-GET methods — use direct or local mock for cross-origin debugging.',
            })}
          </p>
        </div>
      ) : null}

      {section === 'auth' ? (
        <div className="space-y-2">
          <Segmented<'none' | 'basic' | 'bearer'>
            value={request.auth.type}
            onChange={(type) => patch({ auth: { type } })}
            ariaLabel={t({ zh: '认证方式', en: 'Auth type' })}
            options={[
              { value: 'none', label: t({ zh: '无', en: 'None' }) },
              { value: 'basic', label: 'Basic' },
              { value: 'bearer', label: 'Bearer' },
            ]}
          />
          {request.auth.type === 'basic' ? (
            <div className="flex flex-wrap gap-2">
              <Input
                value={request.auth.username ?? ''}
                onChange={(e) => patch({ auth: { ...request.auth, username: e.target.value } })}
                placeholder="username"
                mono
                className="h-8 w-48 text-xs"
                aria-label={t({ zh: 'Basic 用户名', en: 'Basic username' })}
              />
              <Input
                value={request.auth.password ?? ''}
                onChange={(e) => patch({ auth: { ...request.auth, password: e.target.value } })}
                placeholder="password"
                type="password"
                mono
                className="h-8 flex-1 text-xs"
                aria-label={t({ zh: 'Basic 密码', en: 'Basic password' })}
              />
            </div>
          ) : null}
          {request.auth.type === 'bearer' ? (
            <Input
              value={request.auth.token ?? ''}
              onChange={(e) => patch({ auth: { ...request.auth, token: e.target.value } })}
              placeholder="token 或 {{token}}"
              type="password"
              mono
              className="h-8 w-full text-xs"
              aria-label={t({ zh: 'Bearer Token', en: 'Bearer token' })}
            />
          ) : null}
        </div>
      ) : null}

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        align="top"
        maxWidth={560}
        title={t({ zh: '导入 curl 命令', en: 'Import curl command' })}
        bodyClassName="space-y-3"
      >
        <Textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={8}
          mono
          className="text-xs"
          placeholder="curl -X POST 'https://api.example.com' -H 'Authorization: Bearer …' -d '{…}'"
          aria-label={t({ zh: 'curl 命令', en: 'curl command' })}
        />
        {importError ? <ToolAlert tone="error" title={importError} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)}>
            {t({ zh: '取消', en: 'Cancel' })}
          </Button>
          <Button variant="primary" size="sm" onClick={doImport} disabled={!importText.trim()}>
            {t({ zh: '导入并覆盖当前请求', en: 'Import into this request' })}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
