import { useEffect, useState } from 'react';
import { Import, Plus, Send, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitSub } from '@/hooks/useToolkitSub';
import { toToolError } from '@/lib/errors';
import { paramsFromUrlEdit } from '@/lib/apiworkbench/params';
import { CUSTOM_METHOD_PATTERN, WB_METHODS, type WbMethod, type WbRequest } from '@/lib/apiworkbench/types';
import { parseCurlToRequest, toCurl } from '@/lib/apiworkbench/transfer';
import type { Localized } from '@/i18n/locale';
import { RequestAuthEditor } from './RequestAuthEditor';
import { RequestBodyEditor } from './RequestBodyEditor';
import { RequestParamsEditor } from './RequestParamsEditor';
import { CodegenPanel } from './CodegenPanel';
import { ScriptEditor } from './ScriptEditor';

type Section = 'params' | 'headers' | 'body' | 'auth' | 'scripts' | 'postscript' | 'code';

/** `?mode=request&sub=…` 里可寻址的编辑区；graphql 是 Body 的一种模式，所以落到 body。 */
const SUBS = ['params', 'headers', 'body', 'auth', 'graphql', 'scripts', 'postscript', 'code'] as const;

/** 表头行与数据行共用同一套列宽：启用 / 名称 / 值 / 删除。 */
const HEADER_COLS =
  'grid min-w-0 items-center gap-1.5 grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,200px)_minmax(0,1fr)_auto]';

/** Select 里代表「改用自定义动词」的哨兵值，不是合法 HTTP 方法，所以不会和列表撞车。 */
const CUSTOM_METHOD = '__custom__';

interface EditorProps {
  request: WbRequest;
  /** 合并后的变量作用域，Auth 取令牌时要用。 */
  scope: Record<string, string>;
  /** 代理通道带不动 multipart，得提前在 Body 区说明。 */
  proxying: boolean;
  /** 脚本沙箱的失控上限，本次会话内的状态，不进存档。 */
  deadlineMs: number;
  onDeadlineChange: (ms: number) => void;
  onChange: (next: WbRequest) => void;
  onSend: () => void;
  onSave: () => void;
  saving: boolean;
  missing: string[];
  onImported: (req: WbRequest) => void;
}

export function RequestEditor({ request, scope, proxying, deadlineMs, onDeadlineChange, onChange, onSend, onSave, saving, missing, onImported }: EditorProps) {
  const { t } = useI18n();
  const sub = useToolkitSub(SUBS);
  const [section, setSection] = useState<Section>(() => (sub === null ? 'params' : sub === 'graphql' ? 'body' : sub));
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<Localized | null>(null);

  /** 深链在面板已经挂载时也要生效；反过来不写回 URL，点页签不该改地址栏。 */
  useEffect(() => {
    if (!sub) return;
    setSection(sub === 'graphql' ? 'body' : sub);
    // `?sub=graphql` 说的是「就要写 GraphQL 请求体」，和点一下模式页签等价，所以顺手切过去。
    if (sub === 'graphql' && request.body.mode !== 'graphql') {
      onChange({
        ...request,
        body: { ...request.body, mode: 'graphql', graphql: request.body.graphql ?? { query: '', variables: '', operationName: '' } },
      });
    }
  }, [sub]);

  const patch = (next: Partial<WbRequest>) => onChange({ ...request, ...next });

  const editUrl = (url: string) => {
    const params = paramsFromUrlEdit(url, request.params ?? []);
    patch({ url, params: params.length ? params : undefined });
  };

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

  const enabledParams = (request.params ?? []).filter((p) => p.enabled).length;
  const scriptCount = (request.preScript?.trim() ? 1 : 0) + (request.testScript?.trim() ? 1 : 0);

  return (
    <div className="wb-request-editor min-w-0 space-y-3">
      <div className="wb-request-identity"><Select size="sm" value={request.body.mode === 'graphql' ? 'graphql' : 'rest'}
        aria-label={t({ zh: '请求协议', en: 'Request protocol' })}
        onChange={(e) => { patch({ body: { ...request.body, mode: e.target.value === 'graphql' ? 'graphql' : 'none' } }); if (e.target.value === 'graphql') setSection('body'); }}>
        <option value="rest">◎ REST</option><option value="graphql">◇ GraphQL</option>
      </Select><Input
        value={request.name}
        onChange={(e) => patch({ name: e.target.value })}
        aria-label={t({ zh: '请求名称', en: 'Request name' })}
      />
      </div>
      <div className="wb-urlbar flex flex-wrap items-center gap-2">
        <Select
          value={request.customMethod ? CUSTOM_METHOD : request.method}
          onChange={(e) => {
            if (e.target.value === CUSTOM_METHOD) patch({ customMethod: '' });
            else patch({ method: e.target.value as WbMethod, customMethod: undefined });
          }}
          aria-label={t({ zh: '请求方法', en: 'Request method' })}
          wrapperClassName="w-28 shrink-0"
        >
          {WB_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value={CUSTOM_METHOD}>{t({ zh: '自定义…', en: 'Custom…' })}</option>
        </Select>
        {request.customMethod !== undefined ? (
          <Input
            size="md"
            value={request.customMethod}
            onChange={(e) => patch({ customMethod: e.target.value.toUpperCase() })}
            placeholder="PROPFIND"
            mono
            className="w-32 shrink-0"
            aria-label={t({ zh: '自定义方法名', en: 'Custom method name' })}
          />
        ) : null}
        <Input
          value={request.url}
          onChange={(e) => editUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend();
          }}
          placeholder="https://… 或 {{baseUrl}}/path"
          mono
          className="min-w-52 flex-1"
          aria-label={t({ zh: '请求 URL', en: 'Request URL' })}
        />
        <Button variant="primary" onClick={onSend} disabled={saving}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {saving ? t({ zh: '请求中…', en: 'Requesting…' }) : t({ zh: '发送', en: 'Send' })}
        </Button>
        <Button variant="secondary" onClick={onSave}>{t({ zh: '保存', en: 'Save' })}<span aria-hidden="true">⌄</span></Button>
      </div>

      {request.customMethod && !CUSTOM_METHOD_PATTERN.test(request.customMethod) ? (
        <ToolAlert
          tone="warning"
          title={t({ zh: `自定义方法「${request.customMethod}」不合法`, en: `"${request.customMethod}" is not a valid method name` })}
          hint={t({ zh: '只允许大写字母开头、A–Z 0–9 - 组成，最长 16 位；不合法时按左侧选中的方法发送。', en: 'Must start with a capital letter, then A–Z 0–9 - up to 16 characters; until it is valid, the method on the left is used.' })}
        />
      ) : null}

      {missing.length > 0 ? (
        <ToolAlert
          tone="warning"
          title={t({ zh: `未定义变量：${missing.map((m) => `{{${m}}}`).join(' ')}`, en: `Undefined variables: ${missing.map((m) => `{{${m}}}`).join(' ')}` })}
          hint={t(scriptCount
            ? { zh: '在环境中定义后重新选择环境，或直接写死值；预请求脚本里的 pm.variables.set 也能在这次发送中补上。', en: 'Define them in an environment and reselect it, inline the values, or let the pre-request script set them for this send.' }
            : { zh: '在环境中定义后重新选择环境，或直接写死值。', en: 'Define them in an environment and reselect it, or inline the values.' })}
        />
      ) : null}

      <div className="min-w-0 rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/50 px-2.5 py-2">
          <Segmented<Section>
            value={section}
            onChange={setSection}
            ariaLabel={t({ zh: '请求编辑区', en: 'Request editor section' })}
            options={[
              { value: 'params', label: t({ zh: '参数', en: 'Parameters' }) },
              { value: 'body', label: t({ zh: '请求体', en: 'Body' }) },
              { value: 'headers', label: t({ zh: '请求头', en: 'Headers' }) },
              { value: 'auth', label: t({ zh: '授权', en: 'Authorization' }) },
              { value: 'scripts', label: t({ zh: '预请求脚本', en: 'Pre-request Script' }) },
              { value: 'postscript', label: t({ zh: '后请求脚本', en: 'Post-request Script' }) },
              { value: 'code', label: t({ zh: '代码', en: 'Code' }) },
            ]}
          />
          {section === 'headers' ? <Badge tone="neutral">{request.headers.length}</Badge> : null}
          {section === 'params' && enabledParams ? <Badge tone="neutral">{enabledParams}</Badge> : null}
          {scriptCount ? <Badge tone="accent">{t({ zh: `脚本 ${scriptCount} 段`, en: `${scriptCount} script(s)` })}</Badge> : null}
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)} aria-label={t({ zh: '导入 curl', en: 'Import curl' })} title={t({ zh: '导入 curl', en: 'Import curl' })}>
              <Import className="h-3.5 w-3.5" aria-hidden="true" />

            </Button>
            <CopyIconButton text={toCurl(request)} label={{ zh: '复制为 curl', en: 'Copy as curl' }} />

          </div>
        </div>

        <div className="p-2.5">
          {section === 'params' ? (
            <RequestParamsEditor
              url={request.url}
              params={request.params}
              onChange={(next) => patch(next)}
            />
          ) : null}

          {section === 'headers' ? (
            <div className="space-y-2">
              <div className={`${HEADER_COLS} hidden text-[11px] font-medium uppercase tracking-wide text-ink-3 sm:grid`}>
                <span className="justify-self-start">{t({ zh: '启用', en: 'On' })}</span>
                <span>{t({ zh: '名称', en: 'Name' })}</span>
                <span>{t({ zh: '值', en: 'Value' })}</span>
                <span className="justify-self-end">{t({ zh: '删除', en: 'Remove' })}</span>
              </div>
              {request.headers.map((row, index) => (
                <div key={index} className={HEADER_COLS}>
                  <Checkbox
                    checked={row.enabled}
                    onChange={(checked) =>
                      patch({ headers: request.headers.map((h, i) => (i === index ? { ...h, enabled: checked } : h)) })
                    }
                    label={<span className="sr-only">{t({ zh: '启用请求头', en: 'Enable header' })}</span>}
                  />
                  <Input
                    size="sm"
                    value={row.key}
                    onChange={(e) => patch({ headers: request.headers.map((h, i) => (i === index ? { ...h, key: e.target.value } : h)) })}
                    placeholder="Name"
                    mono
                    aria-label={t({ zh: `请求头名称 ${index + 1}`, en: `Header name ${index + 1}` })}
                  />
                  <Input
                    size="sm"
                    value={row.value}
                    onChange={(e) => patch({ headers: request.headers.map((h, i) => (i === index ? { ...h, value: e.target.value } : h)) })}
                    placeholder="value 或 {{token}}"
                    mono
                    className="col-start-2 col-span-2 sm:col-auto sm:col-span-1"
                    aria-label={t({ zh: `请求头值 ${index + 1}`, en: `Header value ${index + 1}` })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="col-start-3 row-start-1 justify-self-end sm:col-auto sm:row-auto"
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

          {section === 'body' ? <RequestBodyEditor body={request.body} proxying={proxying} onChange={(body) => patch({ body })} /> : null}

          {section === 'auth' ? (
            <RequestAuthEditor auth={request.auth} scope={scope} requestId={request.id} onChange={(auth) => patch({ auth })} />
          ) : null}

          {section === 'scripts' || section === 'postscript' ? (
            <ScriptEditor controlledPhase={section === 'scripts' ? 'prerequest' : 'test'} request={request} deadlineMs={deadlineMs} onDeadlineChange={onDeadlineChange} onChange={patch} />
          ) : null}

          {section === 'code' ? <CodegenPanel request={request} /> : null}
        </div>
      </div>

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
