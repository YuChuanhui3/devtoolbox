import { useRef, useState } from 'react';
import { ArrowRight, FileUp, Globe, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { grabHtml } from '@/lib/net';
import { endpointsToImport, parseOpenApi } from '@/lib/apiworkbench/openapi';
import type { ParsedSpec } from '@/lib/apiworkbench/openapi';
import { useWorkbench } from './WorkbenchContext';

const SAMPLE = `openapi: "3.0.0"
info:
  title: Petstore
  version: "1.0"
servers:
  - url: https://petstore.example.com/v1
paths:
  /pets:
    get:
      tags: [pets]
      summary: List pets
      parameters:
        - name: limit
          in: query
          schema: { type: integer }
      responses:
        "200":
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Pet" }
components:
  schemas:
    Pet:
      type: object
      properties:
        id: { type: integer }
        name: { type: string, example: Bubbles }
`;

const METHOD_TONE: Record<string, 'success' | 'accent' | 'warning' | 'danger' | 'neutral'> = {
  GET: 'success',
  POST: 'accent',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'danger',
};

export function OpenApiPanel({ active: _active, onJumpToRequest }: { active: boolean; onJumpToRequest: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { doc, update } = useWorkbench();
  const [text, setText] = useState('');
  const [specUrl, setSpecUrl] = useState('');
  const [parsed, setParsed] = useState<ParsedSpec | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>();
  const [fetching, setFetching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const tryParse = (source: string) => {
    setError(null);
    setHint(undefined);
    try {
      setParsed(parseOpenApi(source));
    } catch (caught) {
      setParsed(null);
      const err = toToolError(caught);
      setError(err.localized);
      setHint(err.hint);
    }
  };

  const readFile = async (file: File) => {
    const body = await file.text();
    setText(body);
    tryParse(body);
  };

  const fetchSpec = async () => {
    if (!specUrl.trim()) return;
    setFetching(true);
    setError(null);
    try {
      const contents = await grabHtml(specUrl.trim(), 'allorigins');
      setText(contents);
      tryParse(contents);
    } catch (caught) {
      const err = toToolError(caught);
      setError(err.localized);
      setHint(err.hint);
      setParsed(null);
    } finally {
      setFetching(false);
    }
  };

  const importSpec = (withMockRoutes: boolean) => {
    if (!parsed) return;
    const result = endpointsToImport(parsed, { withMockRoutes });
    update((d) => ({
      ...d,
      collections: [...d.collections, result.collection],
      environments: result.environment ? [...d.environments, result.environment] : d.environments,
      activeEnvId: result.environment ? result.environment.id : d.activeEnvId,
      mockRoutes: withMockRoutes ? [...d.mockRoutes, ...result.mockRoutes] : d.mockRoutes,
    }));
    toast.success(withMockRoutes
      ? t({ zh: `已生成集合与 ${result.mockRoutes.length} 条 Mock 路由`, en: `Collection plus ${result.mockRoutes.length} mock routes generated` })
      : t({ zh: '已生成集合', en: 'Collection generated' }));
    onJumpToRequest();
  };

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '导入 OpenAPI / Swagger 文档', en: 'Import OpenAPI / Swagger document' })}
        subtitle={t({
          zh: '支持 OpenAPI 3.0（推荐）与 Swagger 2.0 最小提升；仅解析内部 $ref，外部文件引用请先合并后粘贴',
          en: 'OpenAPI 3.0 fully supported; Swagger 2.0 minimally upgraded. Internal $refs only — bundle external files before pasting',
        })}
        bodyClassName="space-y-3"
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          mono
          className="text-xs"
          placeholder="openapi: 3.0.0 / { &quot;openapi&quot;: … }"
          aria-label={t({ zh: 'OpenAPI 文档内容', en: 'OpenAPI document text' })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => tryParse(text)} disabled={!text.trim()}>
            {t({ zh: '解析', en: 'Parse' })}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setText(SAMPLE); tryParse(SAMPLE); }}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '载入示例', en: 'Load sample' })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '选择 .yaml / .json 文件', en: 'Pick .yaml / .json file' })}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".yaml,.yml,.json,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = '';
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={specUrl}
            onChange={(e) => setSpecUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void fetchSpec();
            }}
            placeholder="https://….well-known/openapi.yaml"
            mono
            className="h-8 min-w-56 flex-1 text-xs"
            aria-label={t({ zh: '文档 URL', en: 'Document URL' })}
          />
          <Button variant="ghost" size="sm" onClick={() => void fetchSpec()} disabled={fetching || !specUrl.trim()}>
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            {fetching ? t({ zh: '抓取中…', en: 'Fetching…' }) : t({ zh: '从 URL 抓取', en: 'Fetch URL' })}
          </Button>
        </div>
        {error ? <ToolAlert tone="error" title={error} hint={hint} /> : null}
      </Panel>

      {parsed ? (
        <Panel
          title={
            <span className="flex flex-wrap items-center gap-2">
              {parsed.title}
              <Badge tone="accent">{t({ zh: `${parsed.endpoints.length} 个端点`, en: `${parsed.endpoints.length} endpoints` })}</Badge>
              <Badge>{parsed.baseUrl}</Badge>
            </span>
          }
          actions={
            <span className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => importSpec(false)}>
                {t({ zh: '生成集合', en: 'Generate collection' })}
              </Button>
              <Button variant="primary" size="sm" onClick={() => importSpec(true)}>
                {t({ zh: '生成集合 + Mock 路由', en: 'Collection + mock routes' })}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </span>
          }
          bodyClassName="space-y-1.5"
        >
          {parsed.endpoints.map((endpoint, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-1.5 text-xs">
              <Badge tone={METHOD_TONE[endpoint.method] ?? 'neutral'}>{endpoint.method}</Badge>
              <span className="font-mono text-ink">{endpoint.path}</span>
              <span className="min-w-0 flex-1 truncate text-ink-3">{endpoint.summary}</span>
              {endpoint.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          ))}
          <p className="pt-1 text-[11px] text-ink-3">
            {t({
              zh: `生成后集合 URL 形如 {{baseUrl}}/path，baseUrl 存入新生成的环境「${parsed.title}」${doc.mockRoutes.length ? `；当前已有 ${doc.mockRoutes.length} 条 Mock 路由` : ''}。`,
              en: `Generated requests use {{baseUrl}}/path, with baseUrl saved into a new environment "${parsed.title}"${doc.mockRoutes.length ? `; you already have ${doc.mockRoutes.length} mock routes` : ''}.`,
            })}
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
