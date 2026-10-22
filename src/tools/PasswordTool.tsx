import { useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { ActionBar, CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { randomIntInclusive } from '@/lib/number';
import { cn } from '@/lib/cn';

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';
const AMBIGUOUS = new Set(['0', 'O', '1', 'l', 'I', '|', '`', "'", '"']);

type Dialect = 'general' | 'mysql' | 'mariadb' | 'postgresql';

const DIALECT_SYMBOLS: Record<Dialect, string> = {
  general: SYMBOLS,
  mysql: SYMBOLS.replace(/#/g, ''),
  mariadb: SYMBOLS.replace(/#/g, ''),
  postgresql: SYMBOLS.replace(/[#%@:?\[\]{}]/g, ''),
};

const DIALECT_HINTS: Record<Dialect, L10n> = {
  general: { zh: '通用场景，字符集无额外限制。', en: 'General use, no extra character-set restrictions.' },
  mysql: {
    zh: 'MySQL：已排除 #（mysql 命令行视为行注释开头）；在 SQL 与连接串中仍建议用引号包裹口令。',
    en: 'MySQL: excludes # (the mysql CLI treats it as a line comment); still quote passwords in SQL and connection strings.',
  },
  mariadb: {
    zh: 'MariaDB：已排除 #（MariaDB 客户端视为行注释开头），其余与 MySQL 相同。',
    en: 'MariaDB: excludes # (the MariaDB client treats it as a line comment); otherwise same as MySQL.',
  },
  postgresql: {
    zh: 'PostgreSQL：仅保留在 postgresql://user:pass@host 连接 URI 中无需 URL 编码的符号（排除 # % @ : ? 与括号）。',
    en: 'PostgreSQL: keeps only symbols that need no URL encoding in a postgresql://user:pass@host URI (excluding # % @ : ? and brackets).',
  },
};

interface PasswordOptions {
  length: number;
  count: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

const DEFAULT_OPTIONS: PasswordOptions = {
  length: 16,
  count: 3,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true,
};

function pick(pool: string): string {
  return pool[randomIntInclusive(0, pool.length - 1)];
}

function shuffle(chars: string[]): string[] {
  const result = [...chars];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIntInclusive(0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildPools(options: PasswordOptions, dialect: Dialect): string[] {
  const filter = (pool: string) =>
    options.excludeAmbiguous
      ? Array.from(pool)
          .filter((char) => !AMBIGUOUS.has(char))
          .join('')
      : pool;

  const pools: string[] = [];
  if (options.lowercase) pools.push(filter(LOWERCASE));
  if (options.uppercase) pools.push(filter(UPPERCASE));
  if (options.digits) pools.push(filter(DIGITS));
  if (options.symbols) pools.push(filter(DIALECT_SYMBOLS[dialect]));
  return pools.filter(Boolean);
}

function generatePasswords(options: PasswordOptions, dialect: Dialect): string[] {
  const pools = buildPools(options, dialect);
  if (pools.length === 0) return [];

  const all = pools.join('');
  const length = Math.max(options.length, pools.length);

  return Array.from({ length: options.count }, () => {
    const chars = pools.map((pool) => pick(pool));
    while (chars.length < length) chars.push(pick(all));
    return shuffle(chars).slice(0, length).join('');
  });
}

function evaluateStrength(options: PasswordOptions, dialect: Dialect): { score: number; label: L10n; tone: string } {
  const pools = buildPools(options, dialect);
  const poolSize = pools.join('').length;
  const entropy = poolSize > 0 ? options.length * Math.log2(poolSize) : 0;

  if (entropy < 40) return { score: 25, label: { zh: '弱', en: 'Weak' }, tone: 'bg-danger' };
  if (entropy < 60) return { score: 50, label: { zh: '中等', en: 'Medium' }, tone: 'bg-warn' };
  if (entropy < 80) return { score: 75, label: { zh: '强', en: 'Strong' }, tone: 'bg-ok' };
  return { score: 100, label: { zh: '很强', en: 'Very strong' }, tone: 'bg-ok' };
}

export default function PasswordTool() {
  const { t } = useI18n();
  const [dialect, setDialect] = useState<Dialect>('general');
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_OPTIONS);
  const [passwords, setPasswords] = useState<string[]>(() =>
    generatePasswords(DEFAULT_OPTIONS, 'general'),
  );
  const [error, setError] = useState<L10n | null>(null);

  const strength = useMemo(() => evaluateStrength(options, dialect), [options, dialect]);
  const allText = passwords.join('\n');

  const update = <K extends keyof PasswordOptions>(key: K, value: PasswordOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const generate = () => {
    if (!options.lowercase && !options.uppercase && !options.digits && !options.symbols) {
      setError({ zh: '请至少选择一种字符类型。', en: 'Select at least one character type.' });
      setPasswords([]);
      return;
    }
    setError(null);
    setPasswords(generatePasswords(options, dialect));
  };

  return (
    <div className="space-y-4">
      <ActionBar>
        <Button variant="primary" onClick={generate}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t({ zh: '生成密码', en: 'Generate passwords' })}
        </Button>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '使用 Web Crypto 安全随机数', en: 'Uses Web Crypto secure randomness' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} />
          <DownloadButton filename="passwords.txt" content={allText} />
        </div>
      </ActionBar>

      {error ? <ToolAlert tone="error" title={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title={t({ zh: '生成参数', en: 'Generator settings' })} bodyClassName="space-y-5 p-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="password-length" className="text-ink-2">
                {t({ zh: '密码长度', en: 'Password length' })}
              </label>
              <span className="font-mono text-sm font-semibold text-accent-strong">{options.length}</span>
            </div>
            <input
              id="password-length"
              type="range"
              min={4}
              max={64}
              value={options.length}
              onChange={(event) => update('length', Number(event.target.value))}
              className="mt-2 w-full accent-[var(--accent)]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-ink-3">
              <span>4</span>
              <span>64</span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-ink-2">{t({ zh: '使用场景', en: 'Target system' })}</p>
            <Segmented
              value={dialect}
              onChange={setDialect}
              ariaLabel={t({ zh: '密码使用场景', en: 'Password target system' })}
              options={[
                { value: 'general', label: t({ zh: '通用', en: 'General' }) },
                { value: 'mysql', label: 'MySQL' },
                { value: 'mariadb', label: 'MariaDB' },
                { value: 'postgresql', label: 'PostgreSQL' },
              ]}
            />
            <p className="mt-2 text-xs leading-5 text-ink-3">{t(DIALECT_HINTS[dialect])}</p>
          </div>

          <div>
            <p className="mb-2 text-sm text-ink-2">{t({ zh: '字符类型', en: 'Character types' })}</p>
            <div className="grid grid-cols-2 gap-2">
              <Checkbox
                checked={options.lowercase}
                onChange={(value) => update('lowercase', value)}
                label={t({ zh: '小写字母 a-z', en: 'Lowercase a-z' })}
              />
              <Checkbox
                checked={options.uppercase}
                onChange={(value) => update('uppercase', value)}
                label={t({ zh: '大写字母 A-Z', en: 'Uppercase A-Z' })}
              />
              <Checkbox
                checked={options.digits}
                onChange={(value) => update('digits', value)}
                label={t({ zh: '数字 0-9', en: 'Digits 0-9' })}
              />
              <Checkbox
                checked={options.symbols}
                onChange={(value) => update('symbols', value)}
                label={t({ zh: '特殊符号', en: 'Symbols' })}
              />
            </div>
            <Checkbox
              checked={options.excludeAmbiguous}
              onChange={(value) => update('excludeAmbiguous', value)}
              label={t({ zh: '排除易混淆字符', en: 'Exclude look-alike characters' })}
              description={t({ zh: '0 O 1 l I | 等', en: 'Such as 0 O 1 l I |' })}
              className="mt-2"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password-count" className="text-sm text-ink-2">
              {t({ zh: '生成数量', en: 'Count' })}
            </label>
            <Input
              id="password-count"
              type="number"
              min={1}
              max={20}
              value={options.count}
              onChange={(event) =>
                update('count', Math.min(20, Math.max(1, Number(event.target.value) || 1)))
              }
              className="h-9 w-24 text-center"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">{t({ zh: '密码强度', en: 'Strength' })}</span>
              <span className="font-medium text-ink-2">{t(strength.label)}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn('h-full rounded-full transition-all duration-500 ease-in-out', strength.tone)}
                style={{ width: `${strength.score}%` }}
              />
            </div>
          </div>
        </Panel>

        <Panel
          title={t({ zh: '生成结果', en: 'Generated passwords' })}
          subtitle={t({ zh: `${passwords.length} 个密码`, en: `${passwords.length} passwords` })}
          actions={<CopyIconButton text={allText} label={t({ zh: '复制全部密码', en: 'Copy all passwords' })} />}
          bodyClassName="p-0"
        >
          {passwords.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center px-4 text-xs text-ink-3">
              {t({ zh: '选择参数后点击「生成密码」', en: 'Set the options, then click "Generate passwords"' })}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {passwords.map((password, index) => (
                <li key={`${password}-${index}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 shrink-0 text-center font-mono text-[11px] text-ink-3">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-6 text-ink">
                    {password}
                  </code>
                  <CopyIconButton
                    text={password}
                    label={t({ zh: `复制第 ${index + 1} 个密码`, en: `Copy password ${index + 1}` })}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '密码仅在本地生成，不会保存。建议配合密码管理器使用，并按站点使用不同密码。',
          en: 'Passwords are generated locally and never stored. Use a password manager and a unique password per site.',
        })}
      </p>
    </div>
  );
}
