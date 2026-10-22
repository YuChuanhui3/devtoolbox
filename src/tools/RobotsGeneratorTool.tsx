import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { ActionBar, CopyButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { renderRobots, type RobotsGroup } from '@/lib/robots';

interface RuleState {
  type: 'allow' | 'disallow';
  path: string;
}

interface GroupState {
  userAgents: string;
  rules: RuleState[];
  crawlDelay: string;
}

const INITIAL_GROUPS: GroupState[] = [
  {
    userAgents: '*',
    rules: [
      { type: 'disallow', path: '/admin' },
      { type: 'allow', path: '/admin/public' },
    ],
    crawlDelay: '',
  },
];

export default function RobotsGeneratorTool() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<GroupState[]>(INITIAL_GROUPS);
  const [sitemaps, setSitemaps] = useState('https://example.com/sitemap.xml');

  const updateGroup = (index: number, patch: Partial<GroupState>) =>
    setGroups((current) => current.map((g, i) => (i === index ? { ...g, ...patch } : g)));

  const updateRule = (groupIndex: number, ruleIndex: number, patch: Partial<RuleState>) =>
    setGroups((current) =>
      current.map((g, i) =>
        i === groupIndex
          ? { ...g, rules: g.rules.map((r, ri) => (ri === ruleIndex ? { ...r, ...patch } : r)) }
          : g,
      ),
    );

  const output = useMemo(() => {
    const rendered: RobotsGroup[] = groups.map((g) => ({
      userAgents: g.userAgents.split('\n').map((s) => s.trim()).filter(Boolean),
      rules: g.rules.map((r) => ({ type: r.type, path: r.path })),
      crawlDelay: Number(g.crawlDelay) > 0 ? Number(g.crawlDelay) : null,
    }));
    return renderRobots({ groups: rendered, sitemaps: sitemaps.split('\n').map((s) => s.trim()).filter(Boolean) });
  }, [groups, sitemaps]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          {groups.map((group, groupIndex) => (
            <Panel
              key={groupIndex}
              title={t({ zh: `规则组 ${groupIndex + 1}`, en: `Rule group ${groupIndex + 1}` })}
              actions={
                groups.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGroups((c) => c.filter((_, i) => i !== groupIndex))}
                    aria-label={t({ zh: `删除规则组 ${groupIndex + 1}`, en: `Remove rule group ${groupIndex + 1}` })}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null
              }
            >
              <div className="space-y-3">
                <label className="block text-xs text-ink-3">
                  {t({ zh: 'User-agent（每行一个）', en: 'User-agent (one per line)' })}
                  <Textarea
                    value={group.userAgents}
                    onChange={(e) => updateGroup(groupIndex, { userAgents: e.target.value })}
                    rows={2}
                    mono
                    className="mt-1.5 text-xs"
                  />
                </label>

                <div className="space-y-2">
                  {group.rules.map((rule, ruleIndex) => (
                    <div key={ruleIndex} className="flex items-center gap-2">
                      <Select
                        value={rule.type}
                        onChange={(e) => updateRule(groupIndex, ruleIndex, { type: e.target.value as RuleState['type'] })}
                        aria-label={t({ zh: '规则类型', en: 'Rule type' })}
                        className="h-8 text-xs"
                        wrapperClassName="w-28 shrink-0"
                      >
                        <option value="disallow">Disallow</option>
                        <option value="allow">Allow</option>
                      </Select>
                      <Input
                        value={rule.path}
                        onChange={(e) => updateRule(groupIndex, ruleIndex, { path: e.target.value })}
                        placeholder="/admin"
                        mono
                        className="h-8 flex-1 text-xs"
                        aria-label={t({ zh: '路径', en: 'Path' })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateGroup(groupIndex, { rules: group.rules.filter((_, i) => i !== ruleIndex) })
                        }
                        aria-label={t({ zh: '删除规则', en: 'Remove rule' })}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      updateGroup(groupIndex, { rules: [...group.rules, { type: 'disallow', path: '' }] })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {t({ zh: '添加规则', en: 'Add rule' })}
                  </Button>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-ink-3">
                  {t({ zh: 'Crawl-delay（秒，可选）', en: 'Crawl-delay (seconds, optional)' })}
                  <Input
                    value={group.crawlDelay}
                    onChange={(e) => updateGroup(groupIndex, { crawlDelay: e.target.value })}
                    inputMode="numeric"
                    className="h-8 w-20 text-xs"
                  />
                </label>
              </div>
            </Panel>
          ))}

          <Button
            variant="secondary"
            onClick={() =>
              setGroups((c) => [...c, { userAgents: '*', rules: [{ type: 'disallow', path: '' }], crawlDelay: '' }])
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '添加规则组', en: 'Add rule group' })}
          </Button>
        </div>

        <div className="space-y-4">
          <Panel title={t({ zh: 'robots.txt 预览', en: 'robots.txt preview' })} subtitle={t({ zh: '实时生成', en: 'Generated live' })}>
            <pre className="max-h-64 overflow-auto rounded-xl bg-code-bg p-3 font-mono text-[12px] leading-6 text-ink">
              {output}
            </pre>
          </Panel>

          <Panel title={t({ zh: 'Sitemap（每行一个 URL，可选）', en: 'Sitemap (one URL per line, optional)' })}>
            <Textarea
              value={sitemaps}
              onChange={(e) => setSitemaps(e.target.value)}
              rows={3}
              mono
              className="text-xs"
              placeholder="https://example.com/sitemap.xml"
            />
          </Panel>
        </div>
      </div>

      <ActionBar>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={output} label={{ zh: '复制 robots.txt', en: 'Copy robots.txt' }} />
          <DownloadButton filename="robots.txt" content={output} />
        </div>
      </ActionBar>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '空的 Disallow 表示允许全部抓取；Crawl-delay 并非所有爬虫都支持。生成后请放到网站根目录 /robots.txt。', en: 'An empty Disallow allows all crawling; Crawl-delay is not supported by every crawler. After generating, place the file at the site root as /robots.txt.' })}
      </p>
    </div>
  );
}
