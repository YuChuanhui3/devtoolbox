import { describe, expect, test } from 'vitest';
import {
  countMqttEvents,
  filterMqttEvents,
  formatMqttPayload,
  generateMqttClientId,
  mqttLogText,
  mqttTopicMatches,
  normalizeMqttConfig,
  parseQos,
  validateMqttTopic,
  type MqttLogEvent,
} from './mqtt';
import { ToolError } from '../errors';

describe('normalizeMqttConfig', () => {
  test('ws/wss 原样保留，mqtt/mqtts 自动纠正并记录', () => {
    const direct = normalizeMqttConfig(broker('ws://broker.emqx.io:8083/mqtt'), {});
    expect(direct.url).toBe('ws://broker.emqx.io:8083/mqtt');
    expect(direct.corrected).toBeNull();

    const corrected = normalizeMqttConfig(broker('mqtt://broker.emqx.io:1883'), {});
    expect(corrected.url).toBe('ws://broker.emqx.io:1883');
    expect(corrected.corrected).toBe('mqtt');

    const secure = normalizeMqttConfig(broker('mqtts://broker.example.com:8883'), {});
    expect(secure.url).toBe('wss://broker.example.com:8883');
    expect(secure.corrected).toBe('mqtts');
  });

  test('http/https 也按 WebSocket 方案改写（与 WebSocket 面板口径一致）', () => {
    const result = normalizeMqttConfig(broker('http://broker.local:8083'), {});
    expect(result.url).toBe('ws://broker.local:8083');
    expect(result.corrected).toBe('http');
  });

  test('完整配置：凭据、keepAlive 夹紧、cleanSession、Will、订阅表', () => {
    const result = normalizeMqttConfig(
      {
        ...broker('wss://broker.example.com/mqtt'),
        clientId: 'desk-01',
        username: 'u',
        password: 'p',
        keepAlive: '30',
        cleanSession: false,
        willTopic: 'lwt/desk-01',
        willMessage: 'offline',
        willQos: '1',
        willRetain: true,
        subscriptions: [{ topic: 'sensor/+/temperature', qos: 1 }, { topic: 'alarm/#', qos: 0 }, { topic: '', qos: 0 }],
      },
      {},
    );
    expect(result.clientId).toBe('desk-01');
    expect(result.hasCredentials).toBe(true);
    expect(result.keepAlive).toBe(30);
    expect(result.cleanSession).toBe(false);
    expect(result.will).toEqual({ topic: 'lwt/desk-01', message: 'offline', qos: 1, retain: true });
    expect(result.subscriptions).toEqual([
      { topic: 'sensor/+/temperature', qos: 1 },
      { topic: 'alarm/#', qos: 0 },
    ]);
    expect(result.missing).toEqual([]);
  });

  test('空 clientId 允许（库随机生成）；keepAlive 非法回落 60、超限夹到 65535', () => {
    const empty = normalizeMqttConfig(broker('ws://b'), {});
    expect(empty.clientId).toBe('');
    expect(normalizeMqttConfig({ ...broker('ws://b'), keepAlive: '0' }, {}).keepAlive).toBe(60);
    expect(normalizeMqttConfig({ ...broker('ws://b'), keepAlive: 'abc' }, {}).keepAlive).toBe(60);
    expect(normalizeMqttConfig({ ...broker('ws://b'), keepAlive: '99999' }, {}).keepAlive).toBe(65535);
    expect(normalizeMqttConfig({ ...broker('ws://b'), keepAlive: '30' }, {}).keepAlive).toBe(30);
  });

  test('空地址、非 ws/mqtt 方案、含空格报错', () => {
    expect(() => normalizeMqttConfig(broker(''), {})).toThrow(ToolError);
    expect(() => normalizeMqttConfig(broker('ftp://broker'), {})).toThrow(ToolError);
    expect(() => normalizeMqttConfig(broker('ws://bro ker'), {})).toThrow(ToolError);
  });

  test('Will 半填报错；订阅主题非法报错；变量缺失列入 missing', () => {
    expect(() => normalizeMqttConfig({ ...broker('ws://b'), willTopic: 'lwt/x', willMessage: '' }, {})).toThrow(ToolError);
    expect(() => normalizeMqttConfig({ ...broker('ws://b'), subscriptions: [{ topic: 'bad topic', qos: 0 }] }, {})).toThrow(ToolError);
    const result = normalizeMqttConfig(broker('ws://{{brokerHost}}/mqtt'), {});
    expect(result.missing).toEqual(['brokerHost']);
  });
});

function broker(url: string) {
  return {
    broker: url,
    clientId: '',
    username: '',
    password: '',
    keepAlive: '60',
    cleanSession: true,
    willTopic: '',
    willMessage: '',
    willQos: '0',
    willRetain: false,
    subscriptions: [],
  };
}

describe('validateMqttTopic', () => {
  test('合法主题（含 + 与 # 过滤器）', () => {
    expect(validateMqttTopic('sensor/1/temp', { zh: 'x', en: 'x' })).toBe('sensor/1/temp');
    expect(validateMqttTopic('sensor/+/temp', { zh: 'x', en: 'x' })).toBe('sensor/+/temp');
    expect(validateMqttTopic('#', { zh: 'x', en: 'x' })).toBe('#');
  });
  test('空格、+ 与 # 误用报错', () => {
    expect(() => validateMqttTopic('bad topic', { zh: 'x', en: 'x' })).toThrow(ToolError);
    expect(() => validateMqttTopic('sensor/te+st', { zh: 'x', en: 'x' })).toThrow(ToolError);
    expect(() => validateMqttTopic('sensor/#/late', { zh: 'x', en: 'x' })).toThrow(ToolError);
  });
});

describe('parseQos', () => {
  test('接受 0/1/2；显式非法值报错；空串回落 0', () => {
    expect(parseQos('0')).toBe(0);
    expect(parseQos('1')).toBe(1);
    expect(parseQos('2')).toBe(2);
    expect(() => parseQos('3')).toThrow(ToolError);
    expect(() => parseQos('abc')).toThrow(ToolError);
    expect(parseQos('')).toBe(0);
  });
});

describe('generateMqttClientId', () => {
  test('带 devtoolbox 前缀且两次不同', () => {
    const a = generateMqttClientId();
    const b = generateMqttClientId();
    expect(a.startsWith('devtoolbox-')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('mqttTopicMatches', () => {
  test('精确、单级 +、末级 #、裸 #', () => {
    expect(mqttTopicMatches('sensor/1/temp', 'sensor/1/temp')).toBe(true);
    expect(mqttTopicMatches('sensor/+/temp', 'sensor/1/temp')).toBe(true);
    expect(mqttTopicMatches('sensor/+/temp', 'sensor/1/hum')).toBe(false);
    expect(mqttTopicMatches('sensor/#', 'sensor/1/temp/extra')).toBe(true);
    expect(mqttTopicMatches('#', 'anything')).toBe(true);
    expect(mqttTopicMatches('', 'anything')).toBe(true);
  });
});

describe('countMqttEvents / filterMqttEvents / mqttLogText', () => {
  const events: MqttLogEvent[] = [
    { time: '12:00:00', direction: 'in', topic: 'sensor/1/temp', text: '21.5', qos: 0, retain: false, at: 1 },
    { time: '12:00:01', direction: 'out', topic: 'cmd/1', text: 'on', qos: 1, retain: false, at: 2 },
    { time: '12:00:02', direction: 'sys', topic: '', text: 'connected', qos: 0, retain: false, at: 3 },
  ];

  test('统计按方向分计字节', () => {
    const stats = countMqttEvents(events);
    expect(stats.events).toBe(3);
    expect(stats.bytesIn).toBe('21.5'.length);
    expect(stats.bytesOut).toBe('on'.length);
    expect(stats.lastEventAt).toBe(2);
  });

  test('主题过滤器筛 in/out 日志（sys 无主题恒保留）', () => {
    const filtered = filterMqttEvents(events, 'sensor/#');
    expect(filtered.map((e) => e.topic)).toEqual(['sensor/1/temp', '']);
    expect(filterMqttEvents(events, '')).toHaveLength(3);
  });

  test('日志行包含方向、主题与 QoS/retain 标记', () => {
    const text = mqttLogText(events);
    expect(text).toContain('IN sensor/1/temp 21.5');
    expect(text).toContain('OUT cmd/1 on [qos1]');
    expect(text).toContain('SYS connected');
  });
});

describe('formatMqttPayload', () => {
  test('合法 JSON 缩进，其余原样', () => {
    expect(formatMqttPayload('{"t":1}')).toEqual({ text: '{\n  "t": 1\n}', isJson: true });
    expect(formatMqttPayload('text')).toEqual({ text: 'text', isJson: false });
  });
});
