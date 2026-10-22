import { useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { CopyButton } from '@/components/tool/ToolActions';
import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { useI18n } from '@/i18n/I18nProvider';
import { MQTT_PACKETS_DATASET } from '@/data/mqttPackets';
import { MQTT_LANGS, MQTT_SCENARIOS, MQTT_SNIPPETS, type MqttLang } from '@/data/mqttSnippets';

type View = 'packets' | 'snippets';

export default function MqttCheatsheetTool() {
  const { t } = useI18n();
  const [view, setView] = useState<View>('packets');
  const [lang, setLang] = useState<MqttLang>('js');
  const group = MQTT_SNIPPETS[lang];

  return (
    <div className="space-y-4">
      <Segmented
        value={view}
        onChange={setView}
        ariaLabel={t({ zh: '视图切换', en: 'View switcher' })}
        options={[
          { value: 'packets', label: t({ zh: '报文速查', en: 'Packets' }) },
          { value: 'snippets', label: t({ zh: '代码示例', en: 'Code examples' }) },
        ]}
      />

      {view === 'packets' ? (
        <ReferenceListTool dataset={MQTT_PACKETS_DATASET} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={lang}
              onChange={setLang}
              ariaLabel={t({ zh: '语言选择', en: 'Language selector' })}
              options={MQTT_LANGS.map((id) => ({ value: id, label: MQTT_SNIPPETS[id].label }))}
            />
            <code className="rounded-md border border-line bg-surface-2/60 px-2 py-1 text-[11px] text-ink-3">
              {t(group.install)}
            </code>
          </div>

          {MQTT_SCENARIOS.map((scenario) => {
            const code = group.snippets[scenario.id];
            return (
              <Panel
                key={scenario.id}
                title={t({ zh: `${group.label} · ${t(scenario.label)}`, en: `${group.label} · ${t(scenario.label)}` })}
                actions={<CopyButton text={code} label={{ zh: '复制代码', en: 'Copy code' }} />}
                bodyClassName="p-0"
              >
                <pre className="overflow-x-auto bg-code-bg p-4 font-mono text-[12px] leading-6 text-ink">
                  {code}
                </pre>
              </Panel>
            );
          })}

          <p className="text-center text-[11px] leading-5 text-ink-3">
            {t({
              zh: '示例默认 broker.example.com，可自行替换为公共测试 Broker（broker.emqx.io / test.mosquitto.org / broker.hivemq.com，端口 1883）；公共 Broker 上的消息可能被任何人订阅，请勿发送敏感数据。浏览器 HTTPS 页面请使用 wss://:8084 或 ws://:8083（仅本地 http 页面）。',
              en: 'Examples use broker.example.com; swap in a public test broker (broker.emqx.io / test.mosquitto.org / broker.hivemq.com, port 1883) if convenient — public brokers can be watched by anyone, so never send sensitive data. Browser pages on HTTPS must use wss:// on port 8084 (ws:// on 8083 only from plain-http pages).',
            })}
          </p>
        </div>
      )}
    </div>
  );
}
