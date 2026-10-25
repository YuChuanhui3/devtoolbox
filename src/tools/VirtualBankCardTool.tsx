import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { ActionBar, CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { generateCnProfiles, type CnTestProfile } from '@/lib/faker';

const HEADER: Record<'zh' | 'en', string[]> = {
  zh: ['姓名', '性别', '手机号', '身份证号', '银行卡号(借记卡)', '开户行'],
  en: ['Name', 'Gender', 'Mobile', 'ID Number', 'Debit Card No.', 'Bank'],
};

const toRow = (profile: CnTestProfile, locale: 'zh' | 'en'): string[] => [
  profile.name,
  locale === 'zh' ? profile.gender : profile.gender === '男' ? 'Male' : 'Female',
  profile.phone,
  profile.idCard,
  profile.cardNumber,
  locale === 'zh' ? profile.bank.zh : profile.bank.en,
];

export default function VirtualBankCardTool() {
  const { t, locale } = useI18n();
  const [count, setCount] = useState(10);
  const [profiles, setProfiles] = useState<CnTestProfile[]>(() => generateCnProfiles(10));

  const generate = () => setProfiles(generateCnProfiles(count));

  const tsv = [HEADER[locale].join('\t'), ...profiles.map((profile) => toRow(profile, locale).join('\t'))].join('\n');
  const csv = [HEADER[locale].join(','), ...profiles.map((profile) => toRow(profile, locale).map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '数量', en: 'Count' })}
          <Input
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(event) => setCount(Math.min(200, Math.max(1, Number(event.target.value) || 1)))}
            className="h-8 w-16 text-center text-xs"
            aria-label={t({ zh: '生成数量', en: 'Number to generate' })}
          />
        </label>

        <Button variant="primary" size="sm" onClick={generate}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '生成', en: 'Generate' })}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={tsv} label={{ zh: '复制全部 (TSV)', en: 'Copy all (TSV)' }} />
          <DownloadButton filename="test-profiles.csv" content={`\uFEFF${csv}`} mime="text/csv;charset=utf-8" />
        </div>
      </ActionBar>

      <Panel
        title={t({ zh: '生成结果', en: 'Results' })}
        subtitle={t({ zh: `${profiles.length} 组测试数据`, en: `${profiles.length} test profiles` })}
        bodyClassName="p-0 overflow-x-auto"
      >
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase text-ink-3">
              {HEADER[locale].map((label) => (
                <th key={label} className="px-3 py-2 font-medium whitespace-nowrap">
                  {label}
                </th>
              ))}
              <th className="px-3 py-2" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile, index) => (
              <tr key={`${profile.idCard}-${index}`} className="border-b border-line/60 last:border-b-0">
                {toRow(profile, locale).map((cell, cellIndex) => (
                  <td key={cellIndex} className={`px-3 py-2 whitespace-nowrap text-ink ${cellIndex >= 2 ? 'font-mono text-[12px]' : ''}`}>
                    {cell}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <CopyIconButton
                    text={toRow(profile, locale).join('\t')}
                    label={{ zh: `复制第 ${index + 1} 行`, en: `Copy row ${index + 1}` }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '所有姓名、手机号、身份证号与银行卡号均为随机生成的虚拟数据：身份证含合法校验位，银行卡号通过 Luhn 校验，仅用于开发测试与表单填充，不对应任何真实证件或账户。',
          en: 'Names, mobile numbers, ID numbers and card numbers are randomly generated virtual data: ID checksums are valid and card numbers pass the Luhn check, for development testing and form filling only — none map to a real identity or account.',
        })}
      </p>
    </div>
  );
}
