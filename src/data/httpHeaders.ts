import type { ReferenceDataset } from '@/types/reference';
import type { L10n } from '@/i18n/locale';

const RAW: Array<[string, string, L10n, string]> = [
  ['Accept', 'request', { zh: '客户端可接受的响应媒体类型。', en: 'Media types the client can accept in responses.' }, 'Accept: application/json'],
  ['Accept-Encoding', 'request', { zh: '客户端支持的压缩编码。', en: 'Compression encodings supported by the client.' }, 'Accept-Encoding: gzip, br'],
  ['Accept-Language', 'request', { zh: '客户端偏好语言，用于内容协商。', en: 'Preferred languages of the client, used for content negotiation.' }, 'Accept-Language: zh-CN,zh;q=0.9'],
  ['Authorization', 'request', { zh: '携带认证凭证，如 Bearer Token。', en: 'Carries authentication credentials, such as a Bearer token.' }, 'Authorization: Bearer <token>'],
  ['Cache-Control', 'both', { zh: '控制缓存行为与有效期。', en: 'Controls caching behavior and freshness lifetime.' }, 'Cache-Control: no-cache, max-age=0'],
  ['Content-Type', 'both', { zh: '请求体或响应体的媒体类型与字符集。', en: 'Media type and character set of the request or response body.' }, 'Content-Type: application/json; charset=utf-8'],
  ['Content-Length', 'both', { zh: '消息体的字节长度。', en: 'Length of the message body in bytes.' }, 'Content-Length: 1024'],
  ['Content-Encoding', 'both', { zh: '消息体使用的压缩编码。', en: 'Compression encoding applied to the message body.' }, 'Content-Encoding: gzip'],
  ['Cookie', 'request', { zh: '浏览器携带的 Cookie。', en: 'Cookies carried by the browser.' }, 'Cookie: session=abc123; theme=dark'],
  ['Host', 'request', { zh: '目标主机与端口，HTTP/1.1 必需。', en: 'Target host and port; required in HTTP/1.1.' }, 'Host: api.example.com'],
  ['Origin', 'request', { zh: '跨域请求的来源，用于 CORS 校验。', en: 'Origin of a cross-origin request, used for CORS checks.' }, 'Origin: https://app.example.com'],
  ['Referer', 'request', { zh: '发起请求的页面地址。', en: 'Address of the page that initiated the request.' }, 'Referer: https://app.example.com/page'],
  ['User-Agent', 'request', { zh: '客户端浏览器与操作系统标识。', en: 'Identifies the client browser and operating system.' }, 'User-Agent: Mozilla/5.0 …'],
  ['If-None-Match', 'request', { zh: '配合 ETag 做条件请求，命中时返回 304。', en: 'Conditional request paired with an ETag; returns 304 on a match.' }, 'If-None-Match: "abc123"'],
  ['If-Modified-Since', 'request', { zh: '按最后修改时间做条件请求。', en: 'Conditional request based on the last modification time.' }, 'If-Modified-Since: Wed, 21 Oct 2026 07:28:00 GMT'],
  ['Range', 'request', { zh: '请求资源的一部分，用于断点续传与视频拖动。', en: 'Requests part of a resource; used for resumable downloads and video seeking.' }, 'Range: bytes=0-1023'],
  ['X-Requested-With', 'request', { zh: '传统 AJAX 标识，常配合 CSRF 防护。', en: 'Legacy AJAX marker, often used with CSRF protection.' }, 'X-Requested-With: XMLHttpRequest'],
  ['X-Forwarded-For', 'request', { zh: '代理链上的客户端 IP，可能被伪造。', en: 'Client IPs along the proxy chain; can be spoofed.' }, 'X-Forwarded-For: 203.0.113.1, 10.0.0.2'],
  ['X-Real-IP', 'request', { zh: 'Nginx 等代理传递的真实客户端 IP。', en: 'The real client IP forwarded by proxies such as Nginx.' }, 'X-Real-IP: 203.0.113.1'],
  ['Set-Cookie', 'response', { zh: '服务端设置 Cookie，可附加 HttpOnly / Secure。', en: 'Server sets a cookie, optionally with HttpOnly / Secure flags.' }, 'Set-Cookie: session=abc; HttpOnly; Secure; SameSite=Lax'],
  ['Location', 'response', { zh: '重定向目标或新建资源地址。', en: 'Redirect target or address of a newly created resource.' }, 'Location: /login'],
  ['ETag', 'response', { zh: '资源版本标识，用于协商缓存。', en: 'Resource version identifier, used for conditional caching.' }, 'ETag: "abc123"'],
  ['Last-Modified', 'response', { zh: '资源最后修改时间。', en: 'Last modification time of the resource.' }, 'Last-Modified: Wed, 21 Oct 2026 07:28:00 GMT'],
  ['Access-Control-Allow-Origin', 'response', { zh: 'CORS 允许的来源。', en: 'Origins allowed by CORS.' }, 'Access-Control-Allow-Origin: https://app.example.com'],
  ['Access-Control-Allow-Methods', 'response', { zh: 'CORS 允许的 HTTP 方法。', en: 'HTTP methods allowed by CORS.' }, 'Access-Control-Allow-Methods: GET, POST, PUT'],
  ['Strict-Transport-Security', 'response', { zh: '强制浏览器后续使用 HTTPS。', en: 'Forces the browser to use HTTPS for future visits.' }, 'Strict-Transport-Security: max-age=31536000; includeSubDomains'],
  ['Content-Security-Policy', 'response', { zh: '限制页面可加载与执行的资源，缓解 XSS。', en: 'Restricts the resources a page may load and execute; mitigates XSS.' }, "Content-Security-Policy: default-src 'self'"],
  ['X-Content-Type-Options', 'response', { zh: '禁止浏览器 MIME 嗅探。', en: 'Disables browser MIME sniffing.' }, 'X-Content-Type-Options: nosniff'],
  ['X-Frame-Options', 'response', { zh: '防止页面被嵌入 iframe，缓解点击劫持。', en: 'Prevents the page from being embedded in an iframe; mitigates clickjacking.' }, 'X-Frame-Options: DENY'],
  ['Retry-After', 'response', { zh: '限流或维护时建议的重试等待时间。', en: 'Suggested wait time before retrying during rate limiting or maintenance.' }, 'Retry-After: 120'],
  ['WWW-Authenticate', 'response', { zh: '401 响应中说明认证方式。', en: 'Describes the authentication scheme in a 401 response.' }, 'WWW-Authenticate: Bearer realm="api"'],
  ['Vary', 'response', { zh: '声明缓存键受哪些请求头影响。', en: 'Declares which request headers affect the cache key.' }, 'Vary: Accept-Encoding, Accept-Language'],
];

const CATEGORY_LABEL: Record<string, L10n> = {
  request: { zh: '请求头', en: 'Request header' },
  response: { zh: '响应头', en: 'Response header' },
  both: { zh: '通用', en: 'General' },
};

export const HTTP_HEADERS_DATASET: ReferenceDataset = {
  keyLabel: 'Header',
  searchPlaceholder: { zh: '搜索 Header 名称或说明，例如 cache、cookie…', en: 'Search header names or descriptions, e.g. cache, cookie…' },
  emptyText: { zh: '没有找到匹配的 HTTP Header', en: 'No matching HTTP headers found' },
  intro: {
    zh: '常见 HTTP 请求头与响应头速查，包含典型示例与用途说明。',
    en: 'A quick reference to common HTTP request and response headers, with typical examples and usage notes.',
  },
  filters: [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'request', label: { zh: '请求头', en: 'Request' } },
    { id: 'response', label: { zh: '响应头', en: 'Response' } },
    { id: 'both', label: { zh: '通用', en: 'General' } },
  ],
  items: RAW.map(([name, category, description, example]) => ({
    key: name,
    title: name,
    category,
    description,
    example,
    tags: [
      name.toLowerCase(),
      description.zh,
      description.en,
      CATEGORY_LABEL[category].zh,
      CATEGORY_LABEL[category].en,
    ],
  })),
};
