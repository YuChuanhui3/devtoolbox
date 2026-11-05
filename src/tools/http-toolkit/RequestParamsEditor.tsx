import { useState } from 'react';
import { List, Plus, Table2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { useI18n } from '@/i18n/I18nProvider';
import {
  applyParamsToUrl,
  blankParam,
  bulkTextFromParams,
  paramsFromBulkText,
  paramsFromUrlEdit,
  mergeParsedParams,
} from '@/lib/apiworkbench/params';
import type { WbParam } from '@/lib/apiworkbench/types';

/** 启用 / 名称 / 值 / 删除，与请求头表格同一套列宽。 */
const PARAM_COLS = 'grid min-w-0 items-center gap-1.5 grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,200px)_minmax(0,1fr)_auto]';

interface Props {
  url: string;
  params?: WbParam[];
  /** URL 与参数表必须一起改，否则两边会互相打脸。 */
  onChange: (next: { url: string; params?: WbParam[] }) => void;
}

export function RequestParamsEditor({ url, params, onChange }: Props) {
  const { t } = useI18n();
  const [bulk, setBulk] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  /** 表格没被编辑过时，直接从 URL 现算，避免先写一遍再同步。 */
  const rows = params?.length ? params : paramsFromUrlEdit(url, []);

  const displayRows = rows.length ? rows : [blankParam()];

  const apply = (next: WbParam[]) => onChange({ url: applyParamsToUrl(url, next), params: next.length ? next : undefined });

  const openBulk = (nextBulk: boolean) => {
    if (nextBulk) setDraft(bulkTextFromParams(rows));
    else apply(paramsFromBulkText(draft));
    setBulk(nextBulk);
  };

  return (
    <div className="wb-query-editor min-w-0 space-y-2">
      <div className="wb-query-toolbar flex flex-wrap items-center gap-2">
        <span>{t({ zh: '查询参数', en: 'Query Parameters' })}</span>
        <Segmented<'table' | 'bulk'>
          size="sm"
          value={bulk ? 'bulk' : 'table'}
          onChange={(value) => openBulk(value === 'bulk')}
          ariaLabel={t({ zh: '参数编辑方式', en: 'Query editor mode' })}
          options={[
            { value: 'table', label: <span className="sr-only">{t({ zh: '表格', en: 'Table' })}</span>, icon: <Table2 className="h-3.5 w-3.5" aria-hidden="true" /> },
            { value: 'bulk', label: <span className="sr-only">{t({ zh: '批量', en: 'Bulk' })}</span>, icon: <List className="h-3.5 w-3.5" aria-hidden="true" /> },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={() => apply([...rows, blankParam()])} aria-label={t({ zh: '添加参数', en: 'Add parameter' })}><Plus size={14} /></Button>
      </div>

      {bulk ? (
        <div className="min-w-0 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(null);
            }}
            rows={6}
            mono
            placeholder={'page=2\nq={{keyword}}\n# 以 # 开头的行是注释'}
            aria-label={t({ zh: '参数批量编辑', en: 'Bulk edit query' })}
          />
          {draftError ? <p className="text-xs text-danger">{draftError}</p> : null}
          <p className="text-[11px] text-ink-3">
            {t({
              zh: '每行一个 key=value；空行与行首 # 忽略。切回表格即应用。',
              en: 'One key=value per line; blank lines and lines starting with # are ignored. Switch back to the table to apply.',
            })}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const parsed = paramsFromBulkText(draft);
              if (draft.trim() && parsed.length === 0) {
                setDraftError(t({ zh: '没有解析出任何参数，仍是原样', en: 'Nothing parsed; the query is unchanged' }));
                return;
              }
              apply(mergeParsedParams(parsed, rows));
              setDraftError(null);
            }}
          >
            {t({ zh: '应用', en: 'Apply' })}
          </Button>
        </div>
      ) : (
        <div className="min-w-0 space-y-2">
          <div className={`wb-query-head ${PARAM_COLS} hidden text-[11px] font-medium text-ink-3 sm:grid`}>
            <span className="justify-self-start">{t({ zh: '启用', en: 'On' })}</span>
            <span>{t({ zh: '名称', en: 'Key' })}</span>
            <span>{t({ zh: '值', en: 'Value' })}</span>
            <span className="justify-self-end">{t({ zh: '删除', en: 'Remove' })}</span>
          </div>
          {displayRows.map((row, index) => (
            <div key={index} className={`wb-query-row ${PARAM_COLS}`}>
              <Checkbox
                checked={row.enabled}
                onChange={(checked) => apply(displayRows.map((p, i) => (i === index ? { ...p, enabled: checked } : p)))}
                label={<span className="sr-only">{t({ zh: '启用参数', en: 'Enable parameter' })}</span>}
              />
              <Input
                size="sm"
                value={row.key}
                onChange={(e) => apply(displayRows.map((p, i) => (i === index ? { ...p, key: e.target.value } : p)))}
                placeholder="Key"
                mono
                title={row.description}
                aria-label={t({ zh: `参数名称 ${index + 1}`, en: `Parameter name ${index + 1}` })}
              />
              <Input
                size="sm"
                value={row.value}
                onChange={(e) => apply(displayRows.map((p, i) => (i === index ? { ...p, value: e.target.value } : p)))}
                placeholder="Value"
                mono
                className="col-start-2 col-span-2 sm:col-auto sm:col-span-1"
                aria-label={t({ zh: `参数值 ${index + 1}`, en: `Parameter value ${index + 1}` })}
              />
              <Input size="sm" value={row.description ?? ''} placeholder="Description"
                onChange={(e) => apply(displayRows.map((p, i) => i === index ? { ...p, description: e.target.value } : p))}
                aria-label={t({ zh: `参数描述 ${index + 1}`, en: `Parameter description ${index + 1}` })} />
              <Button
                variant="ghost"
                size="sm"
                className="col-start-3 row-start-1 justify-self-end sm:col-auto sm:row-auto"
                onClick={() => apply(rows.filter((_, i) => i !== index))}
                aria-label={t({ zh: '删除参数', en: 'Remove parameter' })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}

        </div>
      )}
    </div>
  );
}
