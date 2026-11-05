import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * 工具组件注册表。
 * 每个工具独立分包，首屏只加载当前工具，降低初始 bundle 体积。
 */
export const TOOL_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {
  // 数据格式
  'json-toolkit': lazy(() => import('./JsonToolkitTool')),
  'json-to-code': lazy(() => import('./JsonToCodeTool')),

  // 编码加密
  'codec-toolkit': lazy(() => import('./CodecToolkitTool')),
  'hash-toolkit': lazy(() => import('./HashToolkitTool')),
  'crypto-toolkit': lazy(() => import('./CryptoToolkitTool')),

  // 开发调试
  timestamp: lazy(() => import('./TimestampTool')),
  'random-toolkit': lazy(() => import('./RandomToolkitTool')),
  'dev-reference': lazy(() => import('./DevReferenceTool')),
  'url-parser': lazy(() => import('./UrlParserTool')),
  'color-converter': lazy(() => import('./ColorTool')),
  'cron-parser': lazy(() => import('./CronTool')),
  'code-format-toolkit': lazy(() => import('./CodeFormatToolkitTool')),
  'regex-toolkit': lazy(() => import('./RegexToolkitTool')),
  'link-parser-toolkit': lazy(() => import('./LinkParserToolkitTool')),
  'dev-calc-toolkit': lazy(() => import('./DevCalcToolkitTool')),
  'ssl-cert': lazy(() => import('./SslCertTool')),
  'identity-toolkit': lazy(() => import('./IdentityToolkitTool')),

  // 文本处理
  'text-toolkit': lazy(() => import('./TextToolkitTool')),

  // Markdown
  'markdown-editor': lazy(() => import('./MarkdownTool')),

  // 图像处理
  'image-compress': lazy(() => import('./ImageCompressTool')),
  'image-convert': lazy(() => import('./ImageConvertTool')),
  'image-base64': lazy(() => import('./ImageBase64Tool')),
  'qr-generator': lazy(() => import('./QrGeneratorTool')),

  // 网络工具
  'ip-toolkit': lazy(() => import('./IpToolkitTool')),
  'ua-toolkit': lazy(() => import('./UaToolkitTool')),
  'webmaster-toolkit': lazy(() => import('./WebmasterToolkitTool')),
  'browser-toolkit': lazy(() => import('./BrowserToolkitTool')),
  'http-simulator': lazy(() => import('./HoppscotchTool')),
  'site-diagnosis-toolkit': lazy(() => import('./SiteDiagnosisToolkitTool')),
  'page-refresh': lazy(() => import('./PageRefreshTool')),
  'transfer-toolkit': lazy(() => import('./TransferToolkitTool')),
};
