import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { ActionBar, CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { FAKER_COUNTRIES, generateIdentityProfile, type CountryCode, type IdentityProfile } from '@/lib/faker';
import type { L10n } from '@/i18n/locale';

const NATIONAL_ID_LABEL: Record<CountryCode, L10n> = {
  US: { zh: '社会保障号 (SSN)', en: 'Social Security Number' },
  UK: { zh: '国民保险号 (N.I.)', en: 'National Insurance Number' },
  CA: { zh: '社会安全码 (SIN)', en: 'Social Insurance Number' },
  AU: { zh: '税号 (TFN)', en: 'Tax File Number' },
  JP: { zh: '社会保障番号', en: 'My Number' },
  DE: { zh: '社会保险号', en: 'Social Insurance Number' },
  CN: { zh: '身份证号', en: 'ID Card Number' },
};

const STATE_LABEL: L10n = { zh: '州/省', en: 'State / Province' };
const REGION_FALLBACK: L10n = { zh: '区县', en: 'District / County' };

export default function VirtualAddressTool() {
  const { t } = useI18n();
  const [country, setCountry] = useState<CountryCode>('US');
  const [profile, setProfile] = useState<IdentityProfile>(() => generateIdentityProfile('US'));

  const generate = useCallback(() => setProfile(generateIdentityProfile(country)), [country]);

  const groups: { title: L10n; fields: { label: L10n; value: string }[] }[] = [
    {
      title: { zh: '基本资料', en: 'Basic Profile' },
      fields: [
        { label: { zh: '全名', en: 'Full Name' }, value: profile.fullName },
        { label: { zh: '性别', en: 'Gender' }, value: profile.gender },
        { label: { zh: '生日', en: 'Birthday' }, value: profile.birthday },
        { label: { zh: '称谓', en: 'Title' }, value: profile.title },
        { label: { zh: '头发颜色', en: 'Hair Color' }, value: profile.hairColor },
      ],
    },
    {
      title: { zh: '地址', en: 'Address' },
      fields: [
        { label: { zh: '街道', en: 'Street' }, value: profile.street },
        { label: REGION_FALLBACK, value: profile.district },
        { label: { zh: '城市', en: 'City' }, value: profile.city },
        { label: STATE_LABEL, value: profile.region },
        { label: { zh: '州/省全称', en: 'Region Full Name' }, value: profile.regionFull },
        { label: { zh: '邮编', en: 'ZIP / Post Code' }, value: profile.postal },
        { label: { zh: '电话号码', en: 'Phone' }, value: profile.phone },
        { label: { zh: '示例邮箱', en: 'Sample Email' }, value: profile.email },
      ],
    },
    {
      title: { zh: '就业 & 信用卡', en: 'Employment & Credit Card' },
      fields: [
        { label: { zh: '信用卡类型', en: 'Card Type' }, value: profile.cardType },
        { label: { zh: '信用卡号', en: 'Card Number' }, value: profile.cardNumber },
        { label: { zh: 'CVV2', en: 'CVV2' }, value: profile.cvv },
        { label: { zh: '过期时间', en: 'Expiry' }, value: profile.cardExpiry },
        { label: { zh: '职业', en: 'Occupation' }, value: profile.occupation },
        { label: { zh: '公司名称', en: 'Company' }, value: profile.company },
        { label: { zh: '就业状态', en: 'Employment' }, value: profile.employment },
        { label: { zh: '月薪', en: 'Monthly Income' }, value: profile.monthlyIncome },
        { label: NATIONAL_ID_LABEL[profile.country], value: profile.nationalId },
      ],
    },
    {
      title: { zh: '更多资料', en: 'More Details' },
      fields: [
        { label: { zh: '用户名', en: 'Username' }, value: profile.username },
        { label: { zh: '密码', en: 'Password' }, value: profile.password },
        { label: { zh: '身高', en: 'Height' }, value: profile.height },
        { label: { zh: '体重', en: 'Weight' }, value: profile.weight },
        { label: { zh: '血型', en: 'Blood Type' }, value: profile.bloodType },
        { label: { zh: '操作系统', en: 'Operating System' }, value: profile.operatingSystem },
        { label: { zh: 'GUID', en: 'GUID' }, value: profile.guid },
        { label: { zh: '浏览器 UserAgent', en: 'Browser UserAgent' }, value: profile.userAgent },
        { label: { zh: '教育背景', en: 'Education' }, value: profile.education },
        { label: { zh: '个人主页', en: 'Website' }, value: profile.website },
        { label: { zh: '安全问题', en: 'Security Question' }, value: profile.securityQuestion },
        { label: { zh: '问题答案', en: 'Answer' }, value: profile.securityAnswer },
      ],
    },
  ];

  const plainText = groups
    .filter((group) => group.fields.some((field) => field.value))
    .map((group) => [
      `== ${t(group.title)} ==`,
      ...group.fields.filter((field) => field.value).map((field) => `${t(field.label)}: ${field.value}`),
    ].join('\n'))
    .join('\n\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <Select
          value={country}
          onChange={(event) => setCountry(event.target.value as CountryCode)}
          aria-label={t({ zh: '国家', en: 'Country' })}
          className="h-8 text-xs"
          wrapperClassName="w-36"
        >
          {FAKER_COUNTRIES.map((item) => (
            <option key={item.code} value={item.code}>
              {t({ zh: item.zh, en: item.en })}
            </option>
          ))}
        </Select>

        <Button variant="primary" size="sm" onClick={generate}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '生成', en: 'Generate' })}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={plainText} label={{ zh: '复制全部', en: 'Copy all' }} />
          <DownloadButton
            filename="virtual-profile.json"
            content={JSON.stringify(profile, null, 2)}
            mime="application/json;charset=utf-8"
          />
        </div>
      </ActionBar>

      {groups.map((group) => (
        <Panel key={t(group.title)} title={t(group.title)} bodyClassName="p-0">
          <dl className="divide-y divide-line">
            {group.fields
              .filter((field) => field.value)
              .map((field) => (
                <div key={t(field.label)} className="flex items-baseline gap-3 px-4 py-2.5">
                  <dt className="w-36 shrink-0 text-xs text-ink-3">{t(field.label)}</dt>
                  <dd className="min-w-0 flex-1 break-all text-[13px] text-ink">{field.value}</dd>
                  <CopyIconButton
                    text={field.value}
                    label={{ zh: `复制${t(field.label)}`, en: `Copy ${t(field.label)}` }}
                  />
                </div>
              ))}
          </dl>
        </Panel>
      ))}

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '生成的是虚拟测试资料：信用卡号通过 Luhn 校验、邮箱与网址为 example.com 保留域，不指向任何真实个人或可用账户，仅供开发与表单填充测试。',
          en: 'Profiles are virtual test data: card numbers pass the Luhn check, emails and websites use the reserved example.com domain, and nothing maps to a real person or usable account — for development and form-filling tests only.',
        })}
      </p>
    </div>
  );
}
