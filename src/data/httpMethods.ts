import type { ReferenceDataset } from '@/types/reference';
import type { L10n } from '@/i18n/locale';

const RAW: Array<[name: string, semantic: L10n, safe: L10n, idempotent: L10n, description: L10n, example: string]> = [
  [
    'GET',
    { zh: '读取', en: 'Read' },
    { zh: '安全', en: 'Safe' },
    { zh: '幂等', en: 'Idempotent' },
    { zh: '请求获取资源，不应产生副作用。参数通常放在 URL 查询串中。', en: 'Fetch a resource; it should cause no side effects. Parameters usually go in the URL query string.' },
    'GET /users/1',
  ],
  [
    'POST',
    { zh: '创建', en: 'Create' },
    { zh: '非安全', en: 'Unsafe' },
    { zh: '非幂等', en: 'Not idempotent' },
    { zh: '提交数据或创建资源，重复提交可能产生多条记录。', en: 'Submit data or create a resource; repeated submissions may create multiple records.' },
    'POST /users',
  ],
  [
    'PUT',
    { zh: '整体更新', en: 'Full update' },
    { zh: '非安全', en: 'Unsafe' },
    { zh: '幂等', en: 'Idempotent' },
    { zh: '用请求体整体替换目标资源，重复执行结果一致。', en: 'Replace the target resource entirely with the request body; repeating it yields the same result.' },
    'PUT /users/1',
  ],
  [
    'PATCH',
    { zh: '部分更新', en: 'Partial update' },
    { zh: '非安全', en: 'Unsafe' },
    { zh: '非幂等', en: 'Not idempotent' },
    { zh: '对资源做局部修改，只提交需要变更的字段。', en: 'Modify part of a resource, sending only the fields that change.' },
    'PATCH /users/1',
  ],
  [
    'DELETE',
    { zh: '删除', en: 'Delete' },
    { zh: '非安全', en: 'Unsafe' },
    { zh: '幂等', en: 'Idempotent' },
    { zh: '删除目标资源，重复删除通常返回 404 或保持已删除状态。', en: 'Delete the target resource; repeating it usually returns 404 or stays deleted.' },
    'DELETE /users/1',
  ],
  [
    'HEAD',
    { zh: '读取元信息', en: 'Read metadata' },
    { zh: '安全', en: 'Safe' },
    { zh: '幂等', en: 'Idempotent' },
    { zh: '与 GET 相同，但只返回响应头，不返回响应体。', en: 'Same as GET but returns only response headers, no body.' },
    'HEAD /files/report.pdf',
  ],
  [
    'OPTIONS',
    { zh: '探测能力', en: 'Capability probe' },
    { zh: '安全', en: 'Safe' },
    { zh: '幂等', en: 'Idempotent' },
    { zh: '查询资源支持的请求方法，CORS 预检请求使用该方法。', en: 'Query which methods a resource supports; used by CORS preflight requests.' },
    'OPTIONS /users/1',
  ],
  [
    'TRACE',
    { zh: '回显请求', en: 'Echo request' },
    { zh: '安全', en: 'Safe' },
    { zh: '幂等', en: 'Idempotent' },
    { zh: '回显服务器收到的请求，便于诊断，生产环境通常禁用。', en: 'Echo back the request received by the server for diagnostics; usually disabled in production.' },
    'TRACE /',
  ],
  [
    'CONNECT',
    { zh: '建立隧道', en: 'Open a tunnel' },
    { zh: '非安全', en: 'Unsafe' },
    { zh: '非幂等', en: 'Not idempotent' },
    { zh: '建立到目标服务器的隧道，常用于 HTTPS 代理。', en: 'Establish a tunnel to the target server, commonly used with HTTPS proxies.' },
    'CONNECT example.com:443',
  ],
];

export const HTTP_METHODS_DATASET: ReferenceDataset = {
  keyLabel: { zh: '方法', en: 'method' },
  searchPlaceholder: { zh: '搜索请求方法或说明，例如 GET、创建…', en: 'Search methods or descriptions, e.g. GET, create…' },
  emptyText: { zh: '没有找到匹配的请求方法', en: 'No matching request methods' },
  intro: { zh: 'HTTP 请求方法的语义、安全性、幂等性与典型用法。', en: 'Semantics, safety, idempotency and typical usage of HTTP request methods.' },
  filters: [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'safe', label: { zh: '安全方法', en: 'Safe' } },
    { id: 'unsafe', label: { zh: '非安全方法', en: 'Unsafe' } },
  ],
  items: RAW.map(([name, semantic, safe, idempotent, description, example]) => ({
    key: name,
    title: semantic,
    category: safe.zh.includes('非安全') ? 'unsafe' : 'safe',
    description: {
      zh: `${description.zh} 安全性：${safe.zh} / 幂等性：${idempotent.zh}。`,
      en: `${description.en} Safety: ${safe.en} · Idempotency: ${idempotent.en}.`,
    },
    example,
    tags: [name.toLowerCase(), semantic.zh, semantic.en, safe.zh, idempotent.zh, description.zh],
  })),
};
