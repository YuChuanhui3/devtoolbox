import type { CodeGenOptions, ObjectField, TypeNode } from './codegen';

const WORD_MAP: Record<string, string> = {
  account: '账户',
  active: '激活',
  address: '地址',
  age: '年龄',
  amount: '金额',
  api: 'API',
  app: '应用',
  avatar: '头像',
  birthday: '生日',
  can: '可',
  category: '分类',
  children: '子项',
  city: '城市',
  code: '编码',
  comment: '评论',
  config: '配置',
  content: '内容',
  count: '数量',
  country: '国家',
  created: '创建',
  data: '数据',
  date: '日期',
  deleted: '删除',
  desc: '描述',
  description: '描述',
  detail: '详情',
  edit: '编辑',
  email: '邮箱',
  enabled: '启用',
  end: '结束',
  expired: '过期',
  file: '文件',
  first: '首',
  gender: '性别',
  has: '有',
  icon: '图标',
  id: 'ID',
  image: '图片',
  index: '索引',
  info: '信息',
  ip: 'IP',
  is: '是',
  item: '项',
  items: '项目',
  key: '键',
  label: '标签',
  last: '最后',
  level: '等级',
  link: '链接',
  list: '列表',
  logo: '标志',
  message: '消息',
  metadata: '元数据',
  mobile: '手机',
  more: '更多',
  name: '名称',
  nickname: '昵称',
  note: '备注',
  order: '订单',
  orders: '订单列表',
  page: '页面',
  parent: '父级',
  password: '密码',
  path: '路径',
  payload: '载荷',
  phone: '电话',
  price: '价格',
  profile: '资料',
  role: '角色',
  score: '分数',
  settings: '设置',
  sex: '性别',
  size: '大小',
  sort: '排序',
  start: '开始',
  state: '状态',
  status: '状态',
  tag: '标签',
  tags: '标签列表',
  time: '时间',
  timestamp: '时间戳',
  title: '标题',
  token: '令牌',
  total: '总数',
  type: '类型',
  updated: '更新',
  url: 'URL',
  user: '用户',
  username: '用户名',
  value: '值',
  version: '版本',
  weight: '权重',
};

export function splitWords(raw: string): string[] {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9\u4e00-\u9fff]+/)
    .filter(Boolean);
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function describeField(rawKey: string): string {
  const words = splitWords(rawKey).map((word) => word.toLowerCase());
  if (words.length === 0) return `字段 ${rawKey}`;

  const mapped = words.map((word) => WORD_MAP[word] ?? word);
  const known = words.some((word) => Boolean(WORD_MAP[word]));
  if (!known) return `字段 ${rawKey}`;

  if (words[0] === 'is' && mapped.length > 1) return `是否${mapped.slice(1).join('')}`;
  if (words[0] === 'has' && mapped.length > 1) return `是否有${mapped.slice(1).join('')}`;
  if (words[0] === 'can' && mapped.length > 1) return `是否可${mapped.slice(1).join('')}`;
  return mapped.join('');
}

export function sanitizeComment(text: string): string {
  return text.replace(/\*\//g, '* /').replace(/\s+/g, ' ').trim();
}

export function fieldComment(field: ObjectField): string {
  let text = describeField(field.rawKey);
  if (field.type.kind === 'any') text += '（无法推断类型，已使用通用类型）';
  return sanitizeComment(text);
}

export function isNullableNode(node: TypeNode): boolean {
  return Boolean(node.nullable) || node.kind === 'null';
}

export function fieldNeedsOptional(field: ObjectField, options: CodeGenOptions): boolean {
  return options.handleNull && (field.optional || isNullableNode(field.type));
}

