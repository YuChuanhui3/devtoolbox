import type { L10n } from "@/i18n/locale";

export interface HttpStatusCodeInfo {
  code: number;
  name: L10n;
  description: L10n;
  usage: L10n;
}

export interface StatusCategory {
  id: "1xx" | "2xx" | "3xx" | "4xx" | "5xx";
  label: L10n;
  description: L10n;
}

export const STATUS_CATEGORIES: StatusCategory[] = [
  { id: "1xx", label: { zh: "1xx 信息响应", en: "1xx Informational" }, description: { zh: "请求已收到，需要继续处理。", en: "Request received; processing must continue." } },
  { id: "2xx", label: { zh: "2xx 成功", en: "2xx Success" }, description: { zh: "请求已成功被服务器接收、理解并接受。", en: "Request successfully received, understood, and accepted by the server." } },
  { id: "3xx", label: { zh: "3xx 重定向", en: "3xx Redirection" }, description: { zh: "需要采取进一步操作才能完成请求。", en: "Further action is required to complete the request." } },
  { id: "4xx", label: { zh: "4xx 客户端错误", en: "4xx Client Errors" }, description: { zh: "请求包含语法错误或无法完成。", en: "The request contains a syntax error or cannot be completed." } },
  { id: "5xx", label: { zh: "5xx 服务端错误", en: "5xx Server Errors" }, description: { zh: "服务器在处理请求时发生错误。", en: "The server encountered an error while processing the request." } },
];

export const HTTP_STATUS_CODES: HttpStatusCodeInfo[] = [
  { code: 100, name: { zh: "Continue", en: "Continue" }, description: { zh: "继续", en: "Continue" }, usage: { zh: "客户端应继续发送请求体，通常用于大文件上传前的探测。", en: "The client should continue sending the request body; typically used as a probe before uploading large files." } },
  { code: 101, name: { zh: "Switching Protocols", en: "Switching Protocols" }, description: { zh: "切换协议", en: "Switching protocols" }, usage: { zh: "服务器同意客户端切换到 Upgrade 头指定的协议，如 WebSocket。", en: "The server agrees to switch to the protocol specified in the Upgrade header, e.g. WebSocket." } },
  { code: 102, name: { zh: "Processing", en: "Processing" }, description: { zh: "处理中", en: "Processing" }, usage: { zh: "WebDAV 扩展，表示服务器已收到并正在处理请求。", en: "WebDAV extension: the server has received and is processing the request." } },
  { code: 103, name: { zh: "Early Hints", en: "Early Hints" }, description: { zh: "早期提示", en: "Early hints" }, usage: { zh: "在最终响应前返回 Link 头，帮助浏览器提前预加载资源。", en: "Returns Link headers before the final response so browsers can preload resources early." } },

  { code: 200, name: { zh: "OK", en: "OK" }, description: { zh: "请求成功", en: "Request succeeded" }, usage: { zh: "最常见的成功响应，响应体包含请求结果。", en: "The most common success response; the body contains the request result." } },
  { code: 201, name: { zh: "Created", en: "Created" }, description: { zh: "创建成功", en: "Created successfully" }, usage: { zh: "资源创建成功，通常配合 Location 头返回新资源地址。", en: "A resource was created successfully; usually paired with a Location header pointing to the new resource." } },
  { code: 202, name: { zh: "Accepted", en: "Accepted" }, description: { zh: "已接受", en: "Accepted" }, usage: { zh: "请求已接受但尚未处理完成，适合异步任务提交。", en: "The request was accepted but not yet processed; suitable for submitting async tasks." } },
  { code: 203, name: { zh: "Non-Authoritative Information", en: "Non-Authoritative Information" }, description: { zh: "非授权信息", en: "Non-authoritative information" }, usage: { zh: "返回的元信息来自第三方副本，并非源服务器。", en: "The returned meta-information comes from a third-party copy, not the origin server." } },
  { code: 204, name: { zh: "No Content", en: "No Content" }, description: { zh: "无内容", en: "No content" }, usage: { zh: "请求成功但没有响应体，常用于 DELETE 或 PUT。", en: "The request succeeded but there is no response body; commonly used for DELETE or PUT." } },
  { code: 205, name: { zh: "Reset Content", en: "Reset Content" }, description: { zh: "重置内容", en: "Reset content" }, usage: { zh: "要求客户端重置文档视图，例如清空表单。", en: "Asks the client to reset the document view, e.g. clear a form." } },
  { code: 206, name: { zh: "Partial Content", en: "Partial Content" }, description: { zh: "部分内容", en: "Partial content" }, usage: { zh: "范围请求成功，响应体为资源的一部分，常用于断点续传。", en: "The range request succeeded; the body holds part of the resource, commonly used for resumable downloads." } },
  { code: 207, name: { zh: "Multi-Status", en: "Multi-Status" }, description: { zh: "多状态", en: "Multi-status" }, usage: { zh: "WebDAV 扩展，响应体包含多个子操作的独立状态。", en: "WebDAV extension: the response body lists independent statuses for multiple sub-operations." } },
  { code: 208, name: { zh: "Already Reported", en: "Already Reported" }, description: { zh: "已报告", en: "Already reported" }, usage: { zh: "WebDAV 扩展，避免同一资源在多层集合中重复报告。", en: "WebDAV extension: avoids reporting the same resource repeatedly inside nested collections." } },
  { code: 226, name: { zh: "IM Used", en: "IM Used" }, description: { zh: "IM 已使用", en: "IM used" }, usage: { zh: "服务器已完成实例操作，响应为增量结果。", en: "The server has fulfilled an instance manipulation; the response is a delta result." } },

  { code: 300, name: { zh: "Multiple Choices", en: "Multiple Choices" }, description: { zh: "多项选择", en: "Multiple choices" }, usage: { zh: "请求对应多个可选资源，客户端需要选择其一。", en: "The request maps to several candidate resources; the client must pick one." } },
  { code: 301, name: { zh: "Moved Permanently", en: "Moved Permanently" }, description: { zh: "永久重定向", en: "Permanently redirected" }, usage: { zh: "资源已永久迁移，搜索引擎会更新索引，建议更新书签。", en: "The resource has moved permanently; search engines update their index, so bookmarks should be updated." } },
  { code: 302, name: { zh: "Found", en: "Found" }, description: { zh: "临时重定向", en: "Temporarily redirected" }, usage: { zh: "资源临时位于其他地址，后续请求仍使用原 URL。", en: "The resource is temporarily at a different address; subsequent requests still use the original URL." } },
  { code: 303, name: { zh: "See Other", en: "See Other" }, description: { zh: "查看其他位置", en: "See other location" }, usage: { zh: "要求客户端以 GET 请求访问 Location 指定的地址。", en: "The client should fetch the address given by the Location header using GET." } },
  { code: 304, name: { zh: "Not Modified", en: "Not Modified" }, description: { zh: "未修改", en: "Not modified" }, usage: { zh: "缓存有效，客户端可继续使用本地缓存，无响应体。", en: "The cache is still valid; the client may keep using its local copy, with no response body." } },
  { code: 307, name: { zh: "Temporary Redirect", en: "Temporary Redirect" }, description: { zh: "临时重定向", en: "Temporary redirect" }, usage: { zh: "与 302 类似，但要求保持原请求方法与请求体。", en: "Similar to 302, but the original request method and body must be preserved." } },
  { code: 308, name: { zh: "Permanent Redirect", en: "Permanent Redirect" }, description: { zh: "永久重定向", en: "Permanent redirect" }, usage: { zh: "与 301 类似，但要求保持原请求方法与请求体。", en: "Similar to 301, but the original request method and body must be preserved." } },

  { code: 400, name: { zh: "Bad Request", en: "Bad Request" }, description: { zh: "请求参数错误", en: "Bad request parameters" }, usage: { zh: "请求语法有误或参数校验失败，服务器无法处理。", en: "The request syntax is invalid or parameter validation failed; the server cannot process it." } },
  { code: 401, name: { zh: "Unauthorized", en: "Unauthorized" }, description: { zh: "未认证", en: "Not authenticated" }, usage: { zh: "缺少有效身份凭证，需登录或刷新 Token。", en: "No valid credentials provided; log in or refresh the token." } },
  { code: 402, name: { zh: "Payment Required", en: "Payment Required" }, description: { zh: "需要付费", en: "Payment required" }, usage: { zh: "保留状态码，部分 API 用于表示额度不足。", en: "A reserved status code; some APIs use it to indicate insufficient quota." } },
  { code: 403, name: { zh: "Forbidden", en: "Forbidden" }, description: { zh: "无权限", en: "No permission" }, usage: { zh: "已认证但无权访问该资源，权限不足。", en: "Authenticated but not allowed to access this resource; insufficient privileges." } },
  { code: 404, name: { zh: "Not Found", en: "Not Found" }, description: { zh: "资源不存在", en: "Resource not found" }, usage: { zh: "请求的资源未找到，检查路径或资源是否已删除。", en: "The requested resource was not found; check the path or whether the resource has been deleted." } },
  { code: 405, name: { zh: "Method Not Allowed", en: "Method Not Allowed" }, description: { zh: "方法不允许", en: "Method not allowed" }, usage: { zh: "资源存在但不支持该 HTTP 方法，响应应包含 Allow 头。", en: "The resource exists but does not support this HTTP method; the response should include an Allow header." } },
  { code: 406, name: { zh: "Not Acceptable", en: "Not Acceptable" }, description: { zh: "不可接受", en: "Not acceptable" }, usage: { zh: "无法根据 Accept 头生成客户端可接受的响应。", en: "No response matching the client Accept headers can be generated." } },
  { code: 407, name: { zh: "Proxy Authentication Required", en: "Proxy Authentication Required" }, description: { zh: "需要代理认证", en: "Proxy authentication required" }, usage: { zh: "需要先通过代理服务器认证。", en: "Authentication with the proxy server is required first." } },
  { code: 408, name: { zh: "Request Timeout", en: "Request Timeout" }, description: { zh: "请求超时", en: "Request timeout" }, usage: { zh: "客户端在服务器等待时间内未完成请求。", en: "The client did not complete the request within the time the server was willing to wait." } },
  { code: 409, name: { zh: "Conflict", en: "Conflict" }, description: { zh: "请求冲突", en: "Request conflict" }, usage: { zh: "请求与资源当前状态冲突，例如并发更新或唯一键冲突。", en: "The request conflicts with the current state of the resource, e.g. concurrent updates or unique-key collisions." } },
  { code: 410, name: { zh: "Gone", en: "Gone" }, description: { zh: "资源已删除", en: "Resource removed" }, usage: { zh: "资源曾存在但已被永久移除，且无转发地址。", en: "The resource existed once but has been permanently removed, with no forwarding address." } },
  { code: 411, name: { zh: "Length Required", en: "Length Required" }, description: { zh: "需要内容长度", en: "Content-Length required" }, usage: { zh: "请求缺少 Content-Length 头。", en: "The request is missing the Content-Length header." } },
  { code: 412, name: { zh: "Precondition Failed", en: "Precondition Failed" }, description: { zh: "前置条件失败", en: "Precondition failed" }, usage: { zh: "If-Match 等前置条件不满足，常见于乐观锁。", en: "Conditions such as If-Match are not met; common with optimistic locking." } },
  { code: 413, name: { zh: "Content Too Large", en: "Content Too Large" }, description: { zh: "请求体过大", en: "Request body too large" }, usage: { zh: "请求体超过服务器允许的大小限制。", en: "The request body exceeds the size limit allowed by the server." } },
  { code: 414, name: { zh: "URI Too Long", en: "URI Too Long" }, description: { zh: "URI 过长", en: "URI too long" }, usage: { zh: "请求的 URL 长度超过服务器限制。", en: "The request URL is longer than the limit accepted by the server." } },
  { code: 415, name: { zh: "Unsupported Media Type", en: "Unsupported Media Type" }, description: { zh: "媒体类型不支持", en: "Media type not supported" }, usage: { zh: "请求体格式不受支持，检查 Content-Type。", en: "The request body format is not supported; check the Content-Type." } },
  { code: 416, name: { zh: "Range Not Satisfiable", en: "Range Not Satisfiable" }, description: { zh: "范围无法满足", en: "Range not satisfiable" }, usage: { zh: "请求的 Range 超出资源实际范围。", en: "The requested Range is outside the actual bounds of the resource." } },
  { code: 417, name: { zh: "Expectation Failed", en: "Expectation Failed" }, description: { zh: "期望失败", en: "Expectation failed" }, usage: { zh: "无法满足 Expect 请求头中的期望。", en: "The expectation in the Expect request header cannot be met." } },
  { code: 418, name: { zh: "I'm a teapot", en: "I'm a teapot" }, description: { zh: "我是茶壶", en: "I'm a teapot" }, usage: { zh: "历史彩蛋状态码，源自 Hyper Text Coffee Pot Control Protocol。", en: "A historical easter-egg status code from the Hyper Text Coffee Pot Control Protocol." } },
  { code: 421, name: { zh: "Misdirected Request", en: "Misdirected Request" }, description: { zh: "请求被错误定向", en: "Request misdirected" }, usage: { zh: "请求被发送到无法产生响应的服务器，常见于 HTTP/2 连接复用。", en: "The request was sent to a server that cannot produce a response; common with HTTP/2 connection reuse." } },
  { code: 422, name: { zh: "Unprocessable Content", en: "Unprocessable Content" }, description: { zh: "无法处理的内容", en: "Unprocessable content" }, usage: { zh: "语义校验失败，语法正确但字段内容不合法。", en: "Semantic validation failed: the syntax is correct but field values are invalid." } },
  { code: 423, name: { zh: "Locked", en: "Locked" }, description: { zh: "资源已锁定", en: "Resource locked" }, usage: { zh: "WebDAV 扩展，目标资源被锁定。", en: "WebDAV extension: the target resource is locked." } },
  { code: 424, name: { zh: "Failed Dependency", en: "Failed Dependency" }, description: { zh: "依赖失败", en: "Failed dependency" }, usage: { zh: "WebDAV 扩展，由于前一个请求失败导致当前请求失败。", en: "WebDAV extension: the current request failed because a previous request it depended on failed." } },
  { code: 425, name: { zh: "Too Early", en: "Too Early" }, description: { zh: "请求过早", en: "Request too early" }, usage: { zh: "服务器拒绝处理可能被重放的早期请求，建议重试。", en: "The server refuses to process an early request that could be replayed; retry later." } },
  { code: 426, name: { zh: "Upgrade Required", en: "Upgrade Required" }, description: { zh: "需要升级协议", en: "Protocol upgrade required" }, usage: { zh: "客户端需切换到 Upgrade 头指定的协议，例如 TLS。", en: "The client must switch to the protocol named in the Upgrade header, e.g. TLS." } },
  { code: 428, name: { zh: "Precondition Required", en: "Precondition Required" }, description: { zh: "需要前置条件", en: "Precondition required" }, usage: { zh: "要求请求携带 If-Match 等条件，避免并发覆盖。", en: "The request must carry conditions such as If-Match to prevent concurrent overwrites." } },
  { code: 429, name: { zh: "Too Many Requests", en: "Too Many Requests" }, description: { zh: "请求过于频繁", en: "Too many requests" }, usage: { zh: "触发限流，需按 Retry-After 头等待后重试。", en: "Rate limit triggered; wait as indicated by the Retry-After header, then retry." } },
  { code: 431, name: { zh: "Request Header Fields Too Large", en: "Request Header Fields Too Large" }, description: { zh: "请求头过大", en: "Request headers too large" }, usage: { zh: "请求头总大小超过服务器限制。", en: "The total size of the request headers exceeds the server limit." } },
  { code: 451, name: { zh: "Unavailable For Legal Reasons", en: "Unavailable For Legal Reasons" }, description: { zh: "因法律原因不可用", en: "Unavailable for legal reasons" }, usage: { zh: "资源因法律要求被屏蔽。", en: "The resource is blocked due to legal requirements." } },

  { code: 500, name: { zh: "Internal Server Error", en: "Internal Server Error" }, description: { zh: "服务器内部错误", en: "Internal server error" }, usage: { zh: "服务器未预期的错误，需查看服务端日志定位。", en: "An unexpected server error; check server-side logs to locate the cause." } },
  { code: 501, name: { zh: "Not Implemented", en: "Not Implemented" }, description: { zh: "功能未实现", en: "Not implemented" }, usage: { zh: "服务器不支持请求所需的功能。", en: "The server does not support the functionality required by the request." } },
  { code: 502, name: { zh: "Bad Gateway", en: "Bad Gateway" }, description: { zh: "网关错误", en: "Bad gateway" }, usage: { zh: "网关从上游服务器收到无效响应，常见于反向代理。", en: "The gateway received an invalid response from an upstream server; common behind reverse proxies." } },
  { code: 503, name: { zh: "Service Unavailable", en: "Service Unavailable" }, description: { zh: "服务不可用", en: "Service unavailable" }, usage: { zh: "服务器暂时无法处理请求，可能因过载或维护。", en: "The server cannot handle the request temporarily, e.g. due to overload or maintenance." } },
  { code: 504, name: { zh: "Gateway Timeout", en: "Gateway Timeout" }, description: { zh: "网关超时", en: "Gateway timeout" }, usage: { zh: "网关等待上游服务器响应超时。", en: "The gateway timed out waiting for a response from the upstream server." } },
  { code: 505, name: { zh: "HTTP Version Not Supported", en: "HTTP Version Not Supported" }, description: { zh: "HTTP 版本不支持", en: "HTTP version not supported" }, usage: { zh: "服务器不支持请求使用的 HTTP 版本。", en: "The server does not support the HTTP version used in the request." } },
  { code: 506, name: { zh: "Variant Also Negotiates", en: "Variant Also Negotiates" }, description: { zh: "变体协商失败", en: "Variant negotiation failed" }, usage: { zh: "内容协商配置错误导致循环引用。", en: "A content-negotiation misconfiguration causes a circular reference." } },
  { code: 507, name: { zh: "Insufficient Storage", en: "Insufficient Storage" }, description: { zh: "存储空间不足", en: "Insufficient storage" }, usage: { zh: "WebDAV 扩展，服务器无法存储完成请求所需的内容。", en: "WebDAV extension: the server cannot store the content needed to complete the request." } },
  { code: 508, name: { zh: "Loop Detected", en: "Loop Detected" }, description: { zh: "检测到循环", en: "Loop detected" }, usage: { zh: "WebDAV 扩展，服务器检测到无限循环。", en: "WebDAV extension: the server detected an infinite loop." } },
  { code: 510, name: { zh: "Not Extended", en: "Not Extended" }, description: { zh: "未扩展", en: "Not extended" }, usage: { zh: "需要进一步扩展请求才能完成。", en: "Further extensions to the request are required to complete it." } },
  { code: 511, name: { zh: "Network Authentication Required", en: "Network Authentication Required" }, description: { zh: "需要网络认证", en: "Network authentication required" }, usage: { zh: "需要完成网络认证，常见于公共 Wi-Fi 登录页。", en: "Network authentication must be completed first; common on public Wi-Fi sign-in pages." } },
];

export const getStatusCategory = (code: number): StatusCategory => {
  const id = `${String(code).charAt(0)}xx` as StatusCategory["id"];
  return STATUS_CATEGORIES.find((category) => category.id === id) ?? STATUS_CATEGORIES[1];
};
