import type { ReferenceDataset } from '@/types/reference';

type Row = [
  key: string,
  title: { zh: string; en: string },
  category: 'packet' | 'flow' | 'connect',
  description: { zh: string; en: string },
  example: string,
  params: Array<[flag: string, { zh: string; en: string }]>,
];

const RAW: Row[] = [
  [
    'Fixed Header',
    { zh: '固定报头', en: 'Fixed Header' },
    'packet',
    {
      zh: '每个 MQTT 控制报文的前 2 个字节起：高 4 位是报文类型，低 4 位是该类型的标志位；随后是 1–4 字节的剩余长度（每字节最高位为 1 表示还有后续字节，7 位一组的变长编码）。',
      en: 'The first bytes of every control packet: the high 4 bits of byte 1 are the packet type, the low 4 bits are type-specific flags; followed by the Remaining Length encoded as 1–4 bytes (7 bits per byte, high bit set means "more bytes follow").',
    },
    'PUBLISH, QoS 1, 4 KB payload:  0x32 | 80 20 00 ...',
    [
      ['bits 7-4', { zh: '报文类型 1–15', en: 'Packet type 1–15' }],
      ['bits 3-0', { zh: '标志位（DUP / QoS / RETAIN 等）', en: 'Flags (DUP / QoS / RETAIN, etc.)' }],
      ['Remaining Length', { zh: '可变报头 + 有效载荷总字节数', en: 'Total bytes of variable header + payload' }],
    ],
  ],
  [
    'CONNECT',
    { zh: '连接请求', en: 'CONNECT' },
    'packet',
    {
      zh: '客户端建立连接时发送的第一个报文，声明协议级别、Client ID、Keep Alive、遗嘱与账号密码。每个 TCP 连接只能发送一次 CONNECT。',
      en: 'The first packet a client sends, declaring protocol level, Client ID, Keep Alive, will message and credentials. Only one CONNECT is allowed per network connection.',
    },
    '10 82 02 4D 51 54 54 04 C2 00 3C 09 6D 79 5F 63 6C 69 65 6E 74',
    [
      ['Protocol Name', { zh: '固定 "MQTT"（v5 可为 "MQTT" 并配合 Level 5）', en: 'Always "MQTT" (Level 5 for v5)' }],
      ['Client ID', { zh: 'Broker 侧会话身份，1–23 字符（v3.1.1 推荐）', en: 'Session identity on the broker, 1–23 chars recommended' }],
      ['Keep Alive', { zh: '心跳间隔（秒），0 表示禁用', en: 'Heartbeat interval in seconds; 0 disables' }],
      ['Clean Start', { zh: 'true 则丢弃旧会话重新开始', en: 'true discards the previous session' }],
      ['Will Flag', { zh: '置位时携带遗嘱主题与载荷', en: 'Set when a will topic/payload is attached' }],
    ],
  ],
  [
    'CONNACK',
    { zh: '连接确认', en: 'CONNACK' },
    'packet',
    {
      zh: 'Broker 对 CONNECT 的应答，共 4 字节。返回码非 0 表示连接被拒，客户端不应继续发送其他报文。',
      en: 'The broker\'s 4-byte reply to CONNECT. A non-zero return code means the connection was refused and the client should not send further packets.',
    },
    '20 02 00 00  → 连接已接受',
    [
      ['0x00', { zh: '连接已接受', en: 'Connection accepted' }],
      ['0x01', { zh: '协议版本不支持', en: 'Unsupported protocol version' }],
      ['0x02', { zh: 'Client ID 被拒绝', en: 'Client ID rejected' }],
      ['0x03', { zh: '服务不可用', en: 'Server unavailable' }],
      ['0x04', { zh: '用户名或密码错误', en: 'Bad username or password' }],
      ['0x05', { zh: '未授权', en: 'Not authorized' }],
    ],
  ],
  [
    'PUBLISH',
    { zh: '发布消息', en: 'PUBLISH' },
    'packet',
    {
      zh: '向某个主题发送消息。标志位携带 QoS 与 RETAIN；QoS 1/2 时可变报头带报文标识符，有效载荷为任意字节（常见为 UTF-8 JSON）。',
      en: 'Sends a message to a topic. Flags carry QoS and RETAIN; QoS 1/2 include a Packet Identifier; the payload is arbitrary bytes (commonly UTF-8 JSON).',
    },
    '32 1A 00 01 00 17 68 6F 6D 65 2F 6B 69 74 63 68 65 6E 2F ...',
    [
      ['DUP', { zh: '重发标记（QoS 1/2 重试时置位）', en: 'Resend flag (set on QoS 1/2 retries)' }],
      ['QoS', { zh: '0 / 1 / 2 服务质量等级', en: '0 / 1 / 2 quality of service' }],
      ['RETAIN', { zh: '保留消息，新订阅者立即收到', en: 'Retained: new subscribers get it immediately' }],
      ['Topic Name', { zh: '发布主题，不允许通配符', en: 'Target topic; wildcards not allowed' }],
      ['Packet ID', { zh: 'QoS > 0 时的报文标识符', en: 'Packet identifier when QoS > 0' }],
    ],
  ],
  [
    'PUBACK',
    { zh: '发布确认（QoS 1）', en: 'PUBACK (QoS 1)' },
    'packet',
    {
      zh: 'Broker 收到 QoS 1 的 PUBLISH 后回送的确认，报文 4 字节。收到 PUBACK 前客户端会携带 DUP 重发。',
      en: 'The broker\'s 4-byte acknowledgement for a QoS 1 PUBLISH. Until it arrives, the client retransmits with the DUP flag set.',
    },
    '40 02 00 01',
    [['Packet ID', { zh: '与被确认 PUBLISH 相同', en: 'Same as the acknowledged PUBLISH' }]],
  ],
  [
    'PUBREC / PUBREL / PUBCOMP',
    { zh: 'QoS 2 四步握手', en: 'QoS 2 Handshake' },
    'packet',
    {
      zh: 'QoS 2 恰好一次送达的四步流程：发送 PUBLISH → 收到 PUBREC → 发出 PUBREL → 收到 PUBCOMP。报文类型分别为 4/5/6，固定标志位 0x02（PUBREL）。',
      en: 'The four-step exactly-once flow: PUBLISH → PUBREC → PUBREL → PUBCOMP. Packet types 4/5/6; PUBREL carries fixed flags 0x02.',
    },
    'PUBLISH(31) → PUBREC(50) → PUBREL(62) → PUBCOMP(70)',
    [
      ['PUBREC', { zh: '已收到，准备进入第二步', en: 'Received, ready for step 2' }],
      ['PUBREL', { zh: '释放消息，等待最终确认', en: 'Release the message, awaiting final ack' }],
      ['PUBCOMP', { zh: '流程完成，可清理会话队列', en: 'Flow complete; state can be dropped' }],
    ],
  ],
  [
    'SUBSCRIBE / SUBACK',
    { zh: '订阅与应答', en: 'SUBSCRIBE / SUBACK' },
    'packet',
    {
      zh: '一次订阅可携带多个主题过滤器及各自请求的 QoS；SUBACK 按顺序逐一回复授予的 QoS（0x80 表示该主题订阅失败）。',
      en: 'One SUBSCRIBE may carry multiple topic filters, each with a requested QoS; SUBACK replies in order with the granted QoS (0x80 = that filter failed).',
    },
    'SUBSCRIBE t1: home/+/temp qos1  →  SUBACK 01',
    [
      ['Packet ID', { zh: '订阅请求标识符（必填）', en: 'Subscription identifier (required)' }],
      ['Topic Filter', { zh: '支持 + / # 通配符', en: 'Supports + / # wildcards' }],
      ['Requested QoS', { zh: '期望等级，Broker 可降级授予', en: 'Desired QoS; broker may grant lower' }],
      ['0x80', { zh: 'SUBACK 中表示订阅失败', en: 'SUBACK value meaning failure' }],
    ],
  ],
  [
    'UNSUBSCRIBE / UNSUBACK',
    { zh: '取消订阅', en: 'UNSUBSCRIBE / UNSUBACK' },
    'packet',
    {
      zh: '按主题过滤器取消订阅，UNSUBACK 无返回码（v5 有逐主题原因码）。',
      en: 'Removes subscriptions by topic filter. UNSUBACK carries no status codes in v3.1.1 (v5 adds per-topic reason codes).',
    },
    'UNSUBSCRIBE home/kitchen/# → UNSUBACK',
    [['Topic Filter', { zh: '必须与订阅时完全一致', en: 'Must exactly match the subscribed filter' }]],
  ],
  [
    'PINGREQ / PINGRESP',
    { zh: '心跳保活', en: 'PINGREQ / PINGRESP' },
    'packet',
    {
      zh: '空闲时间超过 Keep Alive 时客户端发送 PINGREQ（2 字节报文），Broker 回 PINGRESP。超过 1.5 倍 Keep Alive 无任何报文则连接被断开。',
      en: 'When idle for Keep Alive seconds the client sends a 2-byte PINGREQ and the broker answers PINGRESP. Silence beyond 1.5× Keep Alive drops the connection.',
    },
    'C0 00 → D0 00',
    [['Keep Alive', { zh: '建议 30–120 秒，移动端取大值省电', en: '30–120 s recommended; higher on mobile' }]],
  ],
  [
    'DISCONNECT',
    { zh: '正常断开', en: 'DISCONNECT' },
    'packet',
    {
      zh: '客户端主动结束会话的 2 字节报文（v5 可带原因码）。只有不发 DISCONNECT 就断线（如断电）才触发遗嘱消息。',
      en: 'The client\'s 2-byte graceful close (v5 adds reason codes). The will message fires only when the connection drops without a DISCONNECT, e.g. a power loss.',
    },
    'C0 00 （v5: C0 02 00 = 正常离开）',
    [['Will trigger', { zh: '异常断开才发布遗嘱', en: 'Will is published on abnormal disconnect only' }]],
  ],
  [
    'QoS 0',
    { zh: '最多一次', en: 'At Most Once' },
    'flow',
    {
      zh: '发出去就不管，不重发不确认。吞吐最高，网络抖动时消息可能丢失，适合高频遥测这类丢一两条无所谓的数据。',
      en: 'Fire and forget — no retransmission, no acknowledgement. Highest throughput, messages may be lost; fine for high-rate telemetry where occasional gaps are acceptable.',
    },
    'PUBLISH →',
    [['Packet ID', { zh: '不携带', en: 'Not included' }]],
  ],
  [
    'QoS 1',
    { zh: '至少一次', en: 'At Least Once' },
    'flow',
    {
      zh: '每条消息至少送达一次，可能重复。PUBLISH → PUBACK，未收到确认则带 DUP 重发。适合需要可靠到达、接收端可自行去重的场景。',
      en: 'Delivered at least once, possibly duplicated. PUBLISH → PUBACK; unacknowledged messages are retransmitted with DUP. Suitable when delivery matters more than deduplication.',
    },
    'PUBLISH → PUBACK',
    [['DUP', { zh: '重发时置 1', en: 'Set to 1 on retransmission' }]],
  ],
  [
    'QoS 2',
    { zh: '恰好一次', en: 'Exactly Once' },
    'flow',
    {
      zh: '四步握手保证不丢也不重。开销约为 QoS 1 的两倍，适合计费、告警这类既不能丢也不能重复的消息。',
      en: 'The four-way handshake guarantees no loss and no duplication, at roughly twice the overhead of QoS 1. Use for billing or alarm messages that must arrive exactly once.',
    },
    'PUBLISH → PUBREC → PUBREL → PUBCOMP',
    [['State', { zh: '收发双方都要缓存未完成流程', en: 'Both sides keep in-flight state' }]],
  ],
  [
    'Retained Message',
    { zh: '保留消息', en: 'Retained Message' },
    'flow',
    {
      zh: 'Broker 为每个主题只保存最新一条 RETAIN 消息，新订阅者立刻收到它，常用作设备最后状态。发布空载荷即清除该主题的保留消息。',
      en: 'The broker stores the latest RETAIN message per topic and delivers it to new subscribers immediately — ideal for "last known state". Publishing an empty retained payload clears it.',
    },
    'PUBLISH retain=1, payload="online" → 新订阅者立刻收到 "online"',
    [['Clear', { zh: '发布 retain=1 的空载荷', en: 'Publish a zero-byte retained message' }]],
  ],
  [
    'Last Will and Testament',
    { zh: '遗嘱消息', en: 'Will Message' },
    'flow',
    {
      zh: 'CONNECT 时预置遗嘱主题与载荷，客户端异常掉线后由 Broker 代发遗嘱，用于把设备标记为离线。遗嘱同样可以带 QoS 与 RETAIN。',
      en: 'A topic/payload registered in CONNECT that the broker publishes when the client disappears unexpectedly — the standard way to mark a device offline. The will may carry its own QoS and RETAIN.',
    },
    'CONNECT(will: device/a/status = "offline") → 断电 → Broker 代发',
    [['Will Flag', { zh: 'CONNECT 标志位 bit 2', en: 'CONNECT flag bit 2' }]],
  ],
  [
    'Topic Wildcards',
    { zh: '主题通配符', en: 'Topic Wildcards' },
    'flow',
    {
      zh: '主题用 / 分层。订阅时 + 匹配一个层级，# 匹配其后所有层级且必须放在末尾；发布不允许使用通配符。以 $ 开头的层级（如 $SYS）为保留前缀，+ / # 默认不匹配。',
      en: 'Topics are slash-separated. In subscriptions, + matches exactly one level and # matches all remaining levels and must come last; publishing cannot use wildcards. Levels starting with $ (e.g. $SYS) are reserved and are not matched by + / #.',
    },
    'home/+/temperature  home/#  $SYS/broker/uptime',
    [['home/#', { zh: '匹配 home 下任意深度', en: 'Matches any depth under home' }],
     ['home/+/temp', { zh: '仅匹配一个中间层', en: 'Matches exactly one middle level' }]],
  ],
  [
    'Session',
    { zh: '会话与 Clean Start', en: 'Session & Clean Start' },
    'connect',
    {
      zh: '持久会话保存订阅关系与 QoS 1/2 待发队列，离线消息在重连后送达。Clean Start = false 且 Client ID 稳定才能续用会话；v5 用 Session Expiry 精确控制会话存活时长。',
      en: 'A persistent session stores subscriptions and the QoS 1/2 queue so offline messages arrive after reconnect. Reuse requires Clean Start = false plus a stable Client ID; v5 controls lifetime with Session Expiry.',
    },
    'clientId 固定 + clean=false → 断线 30 分钟 → 重连补收消息',
    [['Clean Start', { zh: 'true = 丢弃旧会话重新开始', en: 'true discards the old session' }],
     ['Session Expiry', { zh: 'v5：会话保留秒数', en: 'v5: seconds the session is kept' }]],
  ],
  [
    'Ports & URL Schemes',
    { zh: '端口与连接地址', en: 'Ports & URL Schemes' },
    'connect',
    {
      zh: '1883 为明文 TCP，8883 为 TLS（mqtts:// / ssl:// / tls://）。浏览器端只能走 WebSocket MQTT：8083 提供 ws://，8084 提供 wss://，常见路径是 /mqtt；HTTPS 页面禁止连 ws:// 明文地址。',
      en: '1883 is plain TCP, 8883 is TLS (mqtts:// / ssl:// / tls://). Browsers must use MQTT over WebSocket: ws:// on 8083 and wss:// on 8084, conventionally at path /mqtt; HTTPS pages may not open plain ws://.',
    },
    'mqtt://host:1883  mqtts://host:8883  ws://host:8083/mqtt  wss://host:8084/mqtt',
    [['1883/tcp', { zh: 'MQTT 明文', en: 'Plain MQTT' }],
     ['8883/tcp', { zh: 'MQTT over TLS', en: 'MQTT over TLS' }],
     ['8083/8084', { zh: 'WebSocket ws / wss', en: 'WebSocket ws / wss' }]],
  ],
];

export const MQTT_PACKETS_DATASET: ReferenceDataset = {
  keyLabel: { zh: '报文 / 概念', en: 'Packet / concept' },
  searchPlaceholder: { zh: '搜索报文或概念，例如 PUBLISH、QoS、遗嘱…', en: 'Search packets or concepts, e.g. PUBLISH, QoS, will…' },
  emptyText: { zh: '没有找到匹配的 MQTT 内容', en: 'No matching MQTT entries' },
  intro: {
    zh: 'MQTT 3.1.1 控制报文、服务质量与连接机制速查（v5 差异已在相应条目注明）。',
    en: 'Quick reference for MQTT 3.1.1 control packets, quality of service and connection mechanics (v5 differences are noted per entry).',
  },
  filters: [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'packet', label: { zh: '报文类型', en: 'Packet types' } },
    { id: 'flow', label: { zh: 'QoS 与消息', en: 'QoS & messaging' } },
    { id: 'connect', label: { zh: '连接机制', en: 'Connection' } },
  ],
  items: RAW.map(([key, title, category, description, example, params]) => ({
    key,
    title,
    category,
    description,
    example,
    params,
    tags: [key.toLowerCase(), title.zh, title.en, description.zh, description.en],
  })),
};
