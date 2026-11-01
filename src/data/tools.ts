import type { CategoryId, ToolMeta } from '@/types/tool';
import type { Locale } from '@/i18n/locale';
import { CATEGORIES } from './categories';

const RAW_TOOLS: ToolMeta[] = [
  // ---------------- 数据格式 ----------------
  {
    id: 'json-toolkit',
    name: 'JSON 工具箱',
    nameEn: 'JSON Toolkit',
    category: 'data',
    description: '共享一份输入：格式化压缩校验、JSONPath 查询、Schema 校验生成、JSON 结构化对比，以及 JSON/XML/YAML/CSV/Properties/Query 六格式互转。',
    descriptionEn: 'One shared input: format, minify, and validate JSON; query with JSONPath; validate or generate schemas; diff JSON structurally; and convert among JSON, XML, YAML, CSV, Properties, and Query.',
    tags: ['json', 'xml', 'yaml', 'csv', 'properties', 'query', '格式化', '压缩', '校验', '美化', 'jsonpath', '查询', 'schema', 'diff', '对比', '转换', '互转'],
    aliases: [
      'json',
      'json格式化',
      'json校验',
      'json美化',
      'json压缩',
      'minify',
      'beautify',
      'formatter',
      'jsonpath',
      'json path',
      'jp',
      '路径查询',
      'json schema',
      'jsonschema',
      'schema校验',
      'schema验证',
      '生成schema',
      'schema generator',
      'jsondiff',
      'json对比',
      'json差异',
      'json diff',
      '差异对比',
      '格式转换',
      '数据格式',
      'json转yaml',
      'yaml转json',
      'json转xml',
      'xml转json',
      'json转csv',
      'csv转json',
      'json转query',
      'query转json',
      'properties转yaml',
      'yaml转properties',
      'json2yaml',
      'yaml2json',
      'json2xml',
      'xml2json',
      'json2csv',
      'csv2json',
      'json2query',
      'query2json',
      'xml',
      'yaml',
      'csv',
      'properties',
    ],
    icon: 'Braces',
    priority: 'P0',
    featured: true,
  },
  {
    id: 'json-to-code',
    name: 'JSON 转多语言实体类',
    nameEn: 'JSON to Entity Classes',
    category: 'data',
    description: '将 JSON 实时生成 TypeScript、Go、Java 等 13 种语言的类型定义。',
    descriptionEn: 'Turn JSON into type definitions for 13 languages including TypeScript, Go, and Java, in real time.',
    tags: ['json', 'codegen', 'go', 'java', 'typescript', '实体类', '代码生成'],
    aliases: ['json2code', 'json转代码', 'json转实体类', '实体类生成', '代码生成'],
    icon: 'Code',
    priority: 'P0',
    featured: true,
  },

  // ---------------- 编码加密 ----------------
  {
    id: 'codec-toolkit',
    name: '编码解码工具箱',
    nameEn: 'Codec Toolkit',
    category: 'encode',
    description: '共享一份输入：Base64、URL、Unicode 转义、Hex、JS 字符串转义、Base32/58/62/100、Gzip 压缩与莫斯电码，八类编解码一键切换。',
    descriptionEn: 'One shared input across eight codecs: Base64, URL, Unicode escapes, Hex, JavaScript string escapes, Base32/58/62/100, Gzip, and Morse code.',
    tags: ['base64', 'url', 'unicode', 'hex', 'escape', 'base32', 'base58', 'gzip', 'morse', '编码', '解码', '转义', '压缩', '解压'],
    aliases: ['b64', 'base64编码', 'urlencode', 'urldecode', 'url编码', 'utf8编码', 'utf8解码', '16进制编码', '网址十六进制', 'unicode编码', 'u编码', 'unicode中文互转', 'hex', '十六进制', 'escape', 'js转义', 'escape编码', 'escape加密', 'escape解密', 'base32编码', 'base32解码', 'base58编码', 'base62编码', 'base100编码', 'gzip加密', 'gzip解密', 'gzip压缩', 'gzip解压', 'deflate', '莫斯密码', '摩斯密码', '摩尔斯电码', 'morse加密', 'morse解密'],
    icon: 'Binary',
    priority: 'P0',
    featured: true,
  },
  {
    id: 'hash-toolkit',
    name: '哈希与口令工具箱',
    nameEn: 'Hash & Password Toolkit',
    category: 'encode',
    description: 'MD5/SHA 全家桶摘要（含文件与 Gravatar）、Bcrypt/Scrypt 口令哈希生成验证、htpasswd 认证行，三种哈希一键切换。',
    descriptionEn: 'Three hashing tools in one kit: MD5/SHA digests (with file and Gravatar modes), Bcrypt/Scrypt password hashing and verification, and htpasswd auth lines.',
    tags: ['md5', 'sha1', 'sha256', 'hash', '摘要', 'bcrypt', 'scrypt', 'htpasswd', '口令哈希'],
    aliases: ['md5', 'sha', 'sha256', 'md2', 'md4', 'sha3', 'keccak', 'shake', 'ripemd160', '文件哈希', 'email加密', 'gravatar', 'bcrypt加密', 'bcrypt生成', 'bcrypt验证', 'scrypt生成', 'scrypt验证', '密码哈希', 'htpasswd生成', 'apache密码文件', 'apr1加密', '{SHA}密码'],
    icon: 'Hash',
    priority: 'P0',
    featured: true,
    sensitive: true,
  },
  {
    id: 'crypto-toolkit',
    name: '加解密工具箱',
    nameEn: 'Cipher Toolkit',
    category: 'encode',
    description: 'AES-GCM/CBC、DES/3DES/Rabbit/RC4 经典对称算法、RSA 密钥对与签名验签、JWT 解析，四类加解密一键切换，全部本地处理。',
    descriptionEn: 'Four cipher tools in one kit: AES-GCM/CBC, classic symmetric DES/3DES/Rabbit/RC4, RSA key pairs with sign/verify, and JWT decoding — all processed locally.',
    tags: ['aes', 'des', 'rsa', 'jwt', '加密', '解密', 'crypto', '签名', '公私钥', 'token'],
    aliases: ['aes加密', '加密', 'des加密', 'des解密', '3des', 'tripledes', 'rabbit加密', 'rc4加密', 'rc4解密', 'rsa加密', 'rsa解密', 'rsa密钥生成', 'rsa2签名', '公私钥生成', 'pem密钥', 'jwt', 'token解析', 'jwt解析'],
    icon: 'Lock',
    priority: 'P0',
    featured: true,
    sensitive: true,
  },

  // ---------------- 开发调试 ----------------
  {
    id: 'timestamp',
    name: '时间戳转换',
    nameEn: 'Timestamp Converter',
    category: 'dev',
    description: '时间戳与日期互转，自动识别秒 / 毫秒。',
    descriptionEn: 'Convert between timestamps and dates, auto-detecting seconds or milliseconds.',
    tags: ['时间戳', 'timestamp', '日期', 'unix'],
    aliases: ['timestamp', 'unix时间戳', '时间转换'],
    icon: 'Clock',
    priority: 'P0',
    featured: true,
  },
  {
    id: 'random-toolkit',
    name: '随机生成工具箱',
    nameEn: 'Random Generator Toolkit',
    category: 'dev',
    description: 'UUID v4 批量生成、指定范围的随机数、自定义字符集的高强度随机密码，三种随机数据一键切换，均基于 Web Crypto 随机源。',
    descriptionEn: 'Three random generators in one kit: batch UUID v4, ranged random numbers, and strong passwords with custom character sets, all backed by the Web Crypto random source.',
    tags: ['uuid', 'guid', '随机', '生成', '密码', 'password', '随机数', '数字'],
    aliases: ['guid', 'uuid生成', 'GUID生成', 'guid随机生成', 'GUID随机生成', 'password', '密码生成', 'mysql密码', 'postgresql密码', 'mariadb密码', '数据库密码', 'random', '随机数', '随机生成'],
    icon: 'Fingerprint',
    priority: 'P0',
    featured: true,
    sensitive: true,
  },
  {
    id: 'regex-toolkit',
    name: '正则表达式工具箱',
    nameEn: 'Regex Toolkit',
    category: 'dev',
    description: '实时测试正则表达式、高亮匹配与捕获组，并支持正则特殊字符转义与还原。',
    descriptionEn: 'Test regular expressions in real time with match highlighting and capture groups, plus escaping and unescaping regex special characters.',
    tags: ['正则', 'regex', '匹配', '测试', '转义'],
    aliases: ['regex', 'regexp', '正则测试', 'regex escape', '正则转义'],
    icon: 'Regex',
    priority: 'P0',
    featured: true,
    customDraft: true,
  },
  {
    id: 'dev-calc-toolkit',
    name: '开发换算计算工具箱',
    nameEn: 'Developer Calc Toolkit',
    category: 'dev',
    description: '进制转换、文件大小换算、CRC16/CRC32 校验与屏幕 PPI 计算，四类开发小计算器一键切换。',
    descriptionEn: 'Four developer calculators in one kit: number base conversion, file size conversion, CRC16/CRC32 checksums, and screen PPI calculation.',
    tags: ['进制', '二进制', '十六进制', '文件大小', 'byte', 'crc', 'crc32', 'crc16', '校验', 'ppi', 'dpi', '像素密度'],
    aliases: ['binary', 'hex', '进制转换', 'size', '字节换算', 'crc32计算', 'crc16计算', 'modbus校验', '循环冗余校验', 'ppi计算', '像素密度计算', '屏幕密度', 'dpi换算'],
    icon: 'Calculator',
    priority: 'P1',
    customDraft: true,
  },
  {
    id: 'dev-reference',
    name: '开发速查手册',
    nameEn: 'Developer Reference',
    category: 'dev',
    description: 'HTTP 状态码、请求头、方法、常用端口、MIME 类型、Linux 命令与 MQTT 报文七类开发速查合为一册，按分类搜索一键复制。',
    descriptionEn: 'Seven developer references in one handbook: HTTP status codes, headers, methods, common ports, MIME types, Linux commands, and MQTT packets—search by category and copy with one click.',
    tags: ['http', '状态码', 'header', '请求头', 'method', '请求方法', '端口', 'mime', 'linux', '命令', 'mqtt', '速查'],
    aliases: ['status', 'http status', '状态码', 'header', '请求头', 'method', '请求方法', 'port', '端口', 'mime', 'content-type', 'linux命令', '命令大全', 'shell命令', '运维命令', '杀死端口进程', '日志查询命令', '基础命令', '命令参数', 'mqtt报文', 'mqtt示例', 'mqtt代码', 'mosquitto', 'qos', '遗嘱消息', '物联网协议'],
    icon: 'BookOpen',
    priority: 'P0',
    featured: true,
  },
  {
    id: 'url-parser',
    name: 'URL 地址解析',
    nameEn: 'URL Parser',
    category: 'dev',
    description: '解析 URL 的协议、主机、路径、查询参数与锚点。',
    descriptionEn: 'Parse a URL into scheme, host, path, query parameters, and fragment.',
    tags: ['url', '解析', 'query', '链接'],
    aliases: ['url解析', 'url parse'],
    icon: 'Link2',
    priority: 'P0',
  },
  {
    id: 'color-converter',
    name: '颜色转换',
    nameEn: 'Color Converter',
    category: 'dev',
    description: 'HEX、RGB、HSL 颜色格式互转，实时预览。',
    descriptionEn: 'Convert among HEX, RGB, and HSL color formats, with live preview.',
    tags: ['颜色', 'color', 'hex', 'rgb', 'hsl'],
    aliases: ['color', 'rgb', 'hex颜色'],
    icon: 'Palette',
    priority: 'P1',
  },
  {
    id: 'cron-parser',
    name: 'Cron 表达式解析',
    nameEn: 'Cron Expression Parser',
    category: 'dev',
    description: '解析 Cron 表达式，展示含义与未来 5 次执行时间。',
    descriptionEn: 'Parse a Cron expression, showing its meaning and the next 5 execution times.',
    tags: ['cron', '定时任务', '表达式'],
    aliases: ['cron', 'crontab'],
    icon: 'CalendarClock',
    priority: 'P1',
  },
  {
    id: 'code-format-toolkit',
    name: '代码格式化工具箱',
    nameEn: 'Code Formatter Toolkit',
    category: 'dev',
    description: '共享一份输入：SQL 语句格式化（MySQL/PostgreSQL 等方言），HTML、CSS、JavaScript 格式化与压缩，两类代码美化一键切换。',
    descriptionEn: 'One shared input for two formatters: SQL statements (MySQL, PostgreSQL, and other dialects), and HTML, CSS, JavaScript formatting and minification.',
    tags: ['sql', 'html', 'css', 'javascript', 'js', '格式化', '压缩', '美化'],
    aliases: ['sql', 'sql美化', 'html格式化', 'css格式化', 'js格式化', '代码压缩', 'web formatter', 'sql格式化', '代码格式化'],
    icon: 'FileCode2',
    priority: 'P1',
  },
  {
    id: 'text-diff',
    name: '文本 / 代码对比',
    nameEn: 'Text Diff',
    category: 'dev',
    description: '按行 / 词 / 字符三种粒度对比两段文本，高亮新增、删除与修改，可忽略空白或按 JSON 对比。',
    descriptionEn: 'Compare two texts at line, word, or character granularity, highlighting additions, deletions, and changes, with whitespace-insensitive and JSON modes.',
    tags: ['diff', '对比', '文本', '代码'],
    aliases: ['diff', '文本对比', '代码对比', '文本diff', '文字对比', '段落对比', '差异对比', 'compare'],
    icon: 'GitCompareArrows',
    priority: 'P1',
  },
  {
    id: 'link-parser-toolkit',
    name: '链接解析工具箱',
    nameEn: 'Link Parser Toolkit',
    category: 'dev',
    description: 'VMess/SS/SSR 代理链接、迅雷/快车/旋风下载链接、种子转磁力、Cisco Type7 口令，四类链接与口令解析器合为一箱，字段全部本地编辑不上传。',
    descriptionEn: 'Four link and credential parsers in one kit: vmess/ss/ssr proxy links, thunder/flashget/qqdl download links, torrent-to-magnet, and Cisco Type 7 passphrases — fields edited locally and never uploaded.',
    tags: ['vmess', 'shadowsocks', 'ssr', '代理链接', '迅雷', '快车', '旋风', '下载链接', 'torrent', 'magnet', 'btih', '种子', 'cisco', 'type7', '思科'],
    aliases: ['vmess解析', 'ss链接解析', 'ssr解析', '节点转换', 'shadowsocks链接', '迅雷链接转换', '迅雷解密', '快车链接', '旋风链接', 'qqdl', '种子转磁力', '磁力链接生成', 'btih计算', 'torrent解析', 'type7加密', 'type7解密', '思科type7', 'type 7'],
    icon: 'Router',
    priority: 'P1',
    sensitive: true,
  },
  {
    id: 'ssl-cert',
    name: '自签名证书生成',
    nameEn: 'Self-Signed Certificate Generator',
    category: 'dev',
    description: '本地签发 RSA 2048/4096 自签名 X.509 证书，下载 private_key.pem 与 certificate.pem。',
    descriptionEn: 'Issue RSA 2048/4096 self-signed X.509 certificates locally, with private_key.pem and certificate.pem downloads.',
    tags: ['ssl', '证书', '自签名', 'pem'],
    aliases: ['自签名证书', 'ssl证书生成', 'https证书', '证书生成器'],
    icon: 'GlobeLock',
    priority: 'P2',
    sensitive: true,
  },
  {
    id: 'identity-toolkit',
    name: '虚拟身份生成',
    nameEn: 'Identity Generator',
    category: 'dev',
    description: '按场景生成测试用虚拟身份：银联卡号/身份证/手机号批量生成，或按国家生成完整地址资料（美英加澳日德中），校验位均合法，仅供开发测试。',
    descriptionEn: 'Generate test identities by scenario: batch UnionPay card, ID, and mobile numbers, or full country-based address profiles (US, UK, Canada, Australia, Japan, Germany, China) with valid check digits, for development testing only.',
    tags: ['银行卡', '身份证', '手机号', '地址', '身份', '测试数据', '生成器', 'fake'],
    aliases: ['银行卡号生成', '身份证生成', '测试卡号', '借记卡', '随机身份', '假地址', '虚拟身份', '美国地址', '随机地址', '测试资料'],
    icon: 'Fingerprint',
    priority: 'P1',
  },

  // ---------------- 文本处理 ----------------
  {
    id: 'text-dedupe',
    name: '文本去重',
    nameEn: 'Text Dedupe',
    category: 'text',
    description: '按行去重，支持忽略空行、前后空格与大小写。',
    descriptionEn: 'Deduplicate lines, with options to ignore blank lines, surrounding whitespace, and case.',
    tags: ['去重', '文本', '行'],
    aliases: ['dedupe', '去重'],
    icon: 'Filter',
    priority: 'P0',
  },
  {
    id: 'text-sort',
    name: '文本排序',
    nameEn: 'Text Sorter',
    category: 'text',
    description: '按行排序，支持正序、倒序、数字、长度与随机排序。',
    descriptionEn: 'Sort lines ascending, descending, numerically, by length, or randomly.',
    tags: ['排序', '文本', 'sort'],
    aliases: ['sort', '排序'],
    icon: 'ArrowDownUp',
    priority: 'P0',
  },
  {
    id: 'case-converter',
    name: '大小写转换',
    nameEn: 'Case Converter',
    category: 'text',
    description: '大小写、标题、驼峰、下划线、短横线与常量命名转换。',
    descriptionEn: 'Convert among uppercase, lowercase, title case, camelCase, snake_case, kebab-case, and CONSTANT_CASE.',
    tags: ['大小写', '命名', 'camel', 'snake'],
    aliases: ['case', '大小写', '驼峰'],
    icon: 'CaseUpper',
    priority: 'P0',
  },
  {
    id: 'word-count',
    name: '字数统计',
    nameEn: 'Word Counter',
    category: 'text',
    description: '统计字符、中英文、数字、单词、行数与段落数。',
    descriptionEn: 'Count characters, Chinese and English text, digits, words, lines, and paragraphs.',
    tags: ['字数', '统计', 'word count'],
    aliases: ['word count', '字数', '文本统计'],
    icon: 'Calculator',
    priority: 'P0',
  },
  {
    id: 'multi-line',
    name: '多行文本处理',
    nameEn: 'Multi-Line Text Processor',
    category: 'text',
    description: '批量添加前后缀、行号、引号，删除空行与批量替换。',
    descriptionEn: 'Batch add prefixes, suffixes, line numbers, and quotes, remove blank lines, and replace in bulk.',
    tags: ['多行', '批量', '前缀', '后缀', '替换'],
    aliases: ['multiline', '多行处理'],
    icon: 'Rows3',
    priority: 'P1',
  },
  {
    id: 'occurrence-count',
    name: '出现次数统计',
    nameEn: 'Occurrence Counter',
    category: 'text',
    description: '统计行或单词出现次数，按频次排序展示。',
    descriptionEn: 'Count line or word occurrences and display them sorted by frequency.',
    tags: ['统计', '频率', '单词', '行'],
    aliases: ['count', '词频统计'],
    icon: 'ListOrdered',
    priority: 'P1',
  },
  {
    id: 'html-cleaner',
    name: 'HTML 标签清理',
    nameEn: 'HTML Tag Cleaner',
    category: 'text',
    description: '移除 HTML 标签与脚本，提取可读纯文本。',
    descriptionEn: 'Strip HTML tags and scripts to extract readable plain text.',
    tags: ['html', '清理', '纯文本'],
    aliases: ['html2text', 'html清理'],
    icon: 'Eraser',
    priority: 'P1',
  },
  {
    id: 'html-entities',
    name: 'HTML 实体转义',
    nameEn: 'HTML Entity Escaper',
    category: 'text',
    description: 'HTML 实体转义与反转义，支持中文转数字实体。',
    descriptionEn: 'Escape and unescape HTML entities, including converting Chinese characters to numeric entities.',
    tags: ['html', '实体', '转义'],
    aliases: ['html entities', 'html转义'],
    icon: 'Code',
    priority: 'P1',
  },

  // ---------------- Markdown ----------------
  {
    id: 'markdown-editor',
    name: 'Markdown 实时渲染',
    nameEn: 'Markdown Live Renderer',
    category: 'markdown',
    description: '左右分栏实时预览，代码块语法高亮，支持同步滚动、自动保存与导出。',
    descriptionEn: 'Side-by-side live preview with syntax-highlighted code blocks, synchronized scrolling, auto-save, and export.',
    tags: ['markdown', 'md', '编辑器', '预览', 'html', '代码高亮'],
    aliases: ['md', 'markdown', 'md渲染', 'markdown代码高亮'],
    icon: 'FileText',
    priority: 'P0',
    featured: true,
    customDraft: true,
  },

  // ---------------- 图像处理 ----------------
  {
    id: 'image-compress',
    name: '图片压缩',
    nameEn: 'Image Compressor',
    category: 'image',
    description: '浏览器本地压缩图片：质量/目标大小双模式，智能择优输出最小格式。',
    descriptionEn: 'Compress images locally: quality or target-size mode, smart pick of the smallest format.',
    tags: ['图片', '压缩', 'image', 'webp', '目标大小', '智能择优'],
    aliases: ['compress', '图片压缩', '压缩到', 'target size'],
    icon: 'ImageDown',
    priority: 'P0',
    featured: true,
  },
  {
    id: 'image-convert',
    name: '图片格式转换',
    nameEn: 'Image Format Converter',
    category: 'image',
    description: 'JPG、PNG、WebP 格式互转，支持批量处理与背景填充。',
    descriptionEn: 'Convert among JPG, PNG, and WebP formats, with batch processing and background fill.',
    tags: ['图片', '格式转换', 'jpg', 'png', 'webp'],
    aliases: ['convert', '图片转换', '格式转换'],
    icon: 'Image',
    priority: 'P0',
  },
  {
    id: 'image-base64',
    name: '图片 Base64 互转',
    nameEn: 'Image ↔ Base64 Converter',
    category: 'image',
    description: '本地图片转 Base64 / Data URL，或将 Base64 还原为可预览、可下载的图片。',
    descriptionEn: 'Convert local images to Base64 / Data URL, or restore Base64 to a previewable, downloadable image.',
    tags: ['图片', 'base64', 'data url', '编码', '解码', '预览'],
    aliases: ['图片base64', 'base64图片', 'dataurl', 'image base64'],
    icon: 'ArrowLeftRight',
    priority: 'P0',
    featured: true,
  },
  {
    id: 'qr-generator',
    name: '二维码生成',
    nameEn: 'QR Code Generator',
    category: 'image',
    description: '输入文本或 URL，生成可配置尺寸、容错级别与颜色的二维码，支持 PNG / SVG 下载。',
    descriptionEn: 'Enter text or a URL to generate QR codes with configurable size, error-correction level, and colors, with PNG / SVG download.',
    tags: ['二维码', 'qrcode', 'qr', 'url', '生成', '下载'],
    aliases: ['二维码生成', '生成二维码', 'qrcode生成器', 'qr code'],
    icon: 'QrCode',
    priority: 'P1',
  },
  {
    id: 'qr-transfer',
    name: '二维码跨网传输',
    nameEn: 'QR File Transfer (Air-gapped)',
    category: 'image',
    description: '把文本或文件切成二维码帧序列播放/下载，另一端相机连续扫码或截图录屏回收，内网外网隔空传 JSON。',
    descriptionEn: 'Split text or files into a sequence of QR frames for playback or download, then reassemble via continuous camera scanning or screenshot/screen-recording salvage — move JSON across air-gapped networks.',
    tags: ['跨网传输', '隔空传输', '内网', 'airgap', 'qr transfer', '分块'],
    aliases: ['二维码传文件', '二维码传json', 'airgap传输', '内网外网传输', '扫码传文件', 'dqx'],
    icon: 'RadioTower',
    priority: 'P1',
    sensitive: true,
  },

  // ---------------- 网络工具 ----------------
  {
    id: 'ip-toolkit',
    name: 'IP 与网络地址工具箱',
    nameEn: 'IP Toolkit',
    category: 'network',
    description: '共享一个 IP 输入：归属地查询、IP↔数字转换、子网掩码计算；另有出口 IP、IP 定位地图、随机 IP 与 MAC 地址生成，六个面板一键切换。',
    descriptionEn: 'One shared IP input across geolocation lookup, IP↔number conversion, and subnet-mask calculation, plus egress IP, map locating, and random IP / MAC generators — six panels in one kit.',
    tags: ['ip', 'ipv4', 'ipv6', '子网', '掩码', 'cidr', '归属地', '定位', 'mac', '公网', '转换'],
    aliases: ['ip随机生成', '随机ip', '生成ip地址', 'ipv6生成', 'ip转数字', '数字转ip', 'ip地址转换数字', '子网掩码', '掩码换算', 'cidr计算', '子网计算', '获取ip', '我的ip', '查ip', '公网ip查询', 'ip查询', 'ip归属地', '查询ip信息', 'ip定位', 'ip查周边', 'ip地图', 'mac地址生成', '生成mac', '物理地址生成'],
    icon: 'Network',
    priority: 'P0',
    featured: true,
  },
  {
    id: 'ua-toolkit',
    name: 'UA 工具箱',
    nameEn: 'User-Agent Toolkit',
    category: 'network',
    description: '随机生成、按平台查询常用 User-Agent 大全、粘贴解析浏览器与设备信息，三种 UA 工具合为一箱。',
    descriptionEn: 'Three UA tools in one kit: random User-Agent generation, a curated UA library by platform, and paste-to-parse browser, OS, and device details.',
    tags: ['useragent', 'ua', '随机', '浏览器', '设备', '伪造', '爬虫', '解析', '大全'],
    aliases: ['ua', 'useragent', 'ua随机生成', '随机ua', '随机useragent', 'ua生成器', '常用ua', 'ua大全', 'useragent大全', '常用user-agent', 'ua解析', '解析ua', 'user-agent解析'],
    icon: 'ScanSearch',
    priority: 'P1',
  },
  {
    id: 'webmaster-toolkit',
    name: '站长工具',
    nameEn: 'Webmaster Toolkit',
    category: 'network',
    description: 'robots.txt 规则配置（分组 Allow/Disallow、Sitemap、抓取延迟）与 shields.io 风格徽章生成（SVG 预览与引用代码），两个站长生成器合为一箱。',
    descriptionEn: 'Two webmaster generators in one kit: a robots.txt builder with grouped Allow/Disallow, Sitemap and crawl delay, and a shields.io-style badge maker with SVG preview and embed code.',
    tags: ['robots', 'txt', '爬虫', 'seo', 'sitemap', 'badge', '徽章', 'shields', 'svg', 'markdown', 'readme'],
    aliases: ['robots生成', 'robots文件', '爬虫协议文件', '徽章生成', 'shields badge', 'README徽章'],
    icon: 'Bot',
    priority: 'P1',
  },
  {
    id: 'browser-toolkit',
    name: '浏览器检测工具箱',
    nameEn: 'Browser Toolkit',
    category: 'network',
    description: '查看当前浏览器的 UA、屏幕、时区、语言、显卡渲染器等环境信息，或解析本站可读 Cookie 与 Cookie 头字符串，全程本地处理。',
    descriptionEn: 'Inspect the current browser environment — UA, screen, time zone, languages, GPU renderer — or read this site\'s cookies and parse Cookie headers, all processed locally.',
    tags: ['浏览器', '信息', 'navigator', '屏幕', 'webgl', 'ua', 'cookie', '会话', '解析'],
    aliases: ['浏览器信息', '我的浏览器', '浏览器检测', 'cookie查询', '查看cookie', 'cookie解析'],
    icon: 'MonitorSmartphone',
    priority: 'P1',
    sensitive: true,
  },
  {
    id: 'curl-code',
    name: 'curl 转代码',
    nameEn: 'curl to Code Converter',
    category: 'network',
    description: '粘贴 curl 命令，一键转换为 Python / PHP / Java / Node.js / JavaScript / Go 等语言请求代码。',
    descriptionEn: 'Paste a curl command and convert it with one click into request code in Python / PHP / Java / Node.js / JavaScript / Go, and more.',
    tags: ['curl', '转换', 'requests', 'axios', 'fetch', 'http'],
    aliases: ['curl转python', 'curl转php', 'curl转java', 'curl转go', 'curl转nodejs', 'curl命令转换'],
    icon: 'Terminal',
    priority: 'P1',
  },
  {
    id: 'http-simulator',
    name: '模拟 HTTP 请求',
    nameEn: 'HTTP Request Simulator',
    category: 'network',
    description: '在线发送 GET / POST 等请求，可自定义请求头与请求体，展示状态码、耗时、响应头与响应体。',
    descriptionEn: 'Send GET / POST and other requests online with custom headers and bodies, showing status code, elapsed time, response headers, and response body.',
    tags: ['http', '请求', '调试', 'api', 'post', 'get'],
    aliases: ['http请求', '模拟请求', '在线请求', 'api调试'],
    icon: 'Send',
    priority: 'P1',
  },
  {
    id: 'websocket-client',
    name: '模拟 WebSocket 请求',
    nameEn: 'WebSocket Request Simulator',
    category: 'network',
    description: '连接任意 ws / wss 地址，收发消息并记录连接事件与关闭码。',
    descriptionEn: 'Connect to any ws / wss address, send and receive messages, and log connection events and close codes.',
    tags: ['websocket', 'ws', 'wss', '模拟', '长连接'],
    aliases: ['websocket测试', 'ws在线', '模拟websocket'],
    icon: 'Webhook',
    priority: 'P1',
  },
  {
    id: 'site-diagnosis-toolkit',
    name: '网站诊断工具箱',
    nameEn: 'Site Diagnosis Toolkit',
    category: 'network',
    description: '共享一个 URL 输入：DNS 解析记录、域名服务器与注册信息、内外链分析、SEO 检测、响应头查看与网络一键体检，六个面板即查即得。',
    descriptionEn: 'One shared URL across six diagnostics: DNS records, nameservers and registration, link audit, SEO check, response headers, and a one-click network health test.',
    tags: ['dns', 'ns', '域名', 'seo', '响应头', '链接', '网络', '诊断', '检测', '延迟', '代理'],
    aliases: ['dns查询', '域名解析', 'dns记录', '解析记录', 'ns查询', '域名服务器', '查询ns记录', '内外链查询', '网站链接查询', '外链查询', 'seo查询', 'seo检测', '网站seo', '网站头信息', '响应头查看', 'http头查询', '网络检查', 'webcheck', '网络诊断'],
    icon: 'Radar',
    priority: 'P1',
  },
  {
    id: 'page-refresh',
    name: '网页自动刷新',
    nameEn: 'Page Auto Refresh',
    category: 'network',
    description: '在预览窗口中按固定间隔自动刷新任意网页，支持绕过缓存强刷。',
    descriptionEn: 'Auto-refresh any web page in a preview window at a fixed interval, with cache-bypass forced reload.',
    tags: ['刷新', '自动', '网页', '监控', 'iframe'],
    aliases: ['网页刷新', '自动刷新网页', '页面定时刷新'],
    icon: 'RefreshCw',
    priority: 'P2',
  },
  {
    id: 'file-drop',
    name: '局域网文件互传',
    nameEn: 'LAN File Transfer',
    category: 'network',
    description: '手机与电脑扫码配对后，通过 WebRTC 在同一 Wi-Fi 下点对点互传文件、图片、视频和文本，不经过任何服务器。',
    descriptionEn: 'Pair phone and computer by scanning a QR code, then transfer files, images, videos, and text peer-to-peer over WebRTC on the same Wi-Fi, without passing through any server.',
    tags: ['文件', '互传', '局域网', 'webrtc', '手机', '传输'],
    aliases: ['文件互传', '局域网传输', '传文件', '手机传电脑', 'airdrop', 'filedrop'],
    icon: 'SendHorizontal',
    priority: 'P0',
    featured: true,
  },
];

/** 展示顺序：先按分类（拼音序），分类内工具名同样按拼音首字母排序。 */
const CATEGORY_INDEX = new Map(CATEGORIES.map((category, index) => [category.id, index]));

/** 首字为汉字时的拼音读音，用于与英文工具名按字母混排；新增汉字首字未命中时排在末尾。 */
const CJK_INITIAL_PINYIN: Record<string, string> = {
  编: 'bian',
  哈: 'ha',
  加: 'jia',
  开: 'kai',
  链: 'lian',
  二: 'er',
  出: 'chu',
  代: 'dai',
  多: 'duo',
  大: 'da',
  子: 'zi',
  常: 'chang',
  图: 'tu',
  域: 'yu',
  模: 'mo',
  正: 'zheng',
  浏: 'liu',
  获: 'huo',
  莫: 'mo',
  颜: 'yan',
  种: 'zhong',
  屏: 'ping',
  文: 'wen',
  数: 'shu',
  时: 'shi',
  字: 'zi',
  局: 'ju',
  站: 'zhan',
  网: 'wang',
  自: 'zi',
  进: 'jin',
  随: 'sui',
  迅: 'xun',
  虚: 'xu',
};

const pinyinSortKey = (name: string): string => {
  const first = name.charAt(0);
  if (/[a-z]/i.test(first)) return name.toLowerCase();
  const pinyin = CJK_INITIAL_PINYIN[first];
  return pinyin ? `${pinyin}\u0000${name}` : `\uffff${name}`;
};

/** 新增工具的汉字首字若不在拼音表中，排序会退到末尾，用测试提醒补表。 */
export const hasSortPinyin = (name: string): boolean =>
  /[a-z]/i.test(name.charAt(0)) || name.charAt(0) in CJK_INITIAL_PINYIN;

export const compareToolName = (a: { name: string }, b: { name: string }): number => {
  const keyA = pinyinSortKey(a.name);
  const keyB = pinyinSortKey(b.name);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
};

export const toolName = (tool: ToolMeta, locale: Locale): string =>
  locale === 'en' ? (tool.nameEn ?? tool.name) : tool.name;

export const toolDescription = (tool: ToolMeta, locale: Locale): string =>
  locale === 'en' ? (tool.descriptionEn ?? tool.description) : tool.description;

export const compareToolNameLocale = (locale: Locale) => (a: ToolMeta, b: ToolMeta): number =>
  compareToolName({ name: toolName(a, locale) }, { name: toolName(b, locale) });

/** en 界面按英文名（nameEn）字母排序，同时保持分类分组不变。 */
export const sortToolsForLocale = (tools: ToolMeta[], locale: Locale): ToolMeta[] => {
  if (locale !== 'en') return tools;
  return [...tools].sort(
    (a, b) =>
      (CATEGORY_INDEX.get(a.category) ?? 0) - (CATEGORY_INDEX.get(b.category) ?? 0) ||
      compareToolNameLocale(locale)(a, b),
  );
};

export const TOOLS: ToolMeta[] = [...RAW_TOOLS].sort((a, b) => {
  const byCategory = (CATEGORY_INDEX.get(a.category) ?? 0) - (CATEGORY_INDEX.get(b.category) ?? 0);
  if (byCategory !== 0) return byCategory;
  return compareToolName(a, b);
});

export const TOOL_MAP = new Map<string, ToolMeta>(TOOLS.map((tool) => [tool.id, tool]));

/** 同类工具陆续合并为工具箱，保留旧链接、收藏与最近使用的兼容映射。 */
export const LEGACY_TOOL_IDS: Record<string, string> = {
  'yaml-to-json': 'json-toolkit',
  'xml-to-json': 'json-toolkit',
  'csv-to-json': 'json-toolkit',
  'json-to-yaml': 'json-toolkit',
  'json-to-xml': 'json-toolkit',
  'json-to-csv': 'json-toolkit',
  'json-query': 'json-toolkit',
  'yaml-properties': 'json-toolkit',
  'format-converter': 'json-toolkit',
  'json-formatter': 'json-toolkit',
  jsonpath: 'json-toolkit',
  'json-schema': 'json-toolkit',
  'json-diff': 'json-toolkit',
  base64: 'codec-toolkit',
  'url-codec': 'codec-toolkit',
  unicode: 'codec-toolkit',
  'hex-text': 'codec-toolkit',
  'js-escape': 'codec-toolkit',
  'base-codec': 'codec-toolkit',
  'gzip-codec': 'codec-toolkit',
  'morse-codec': 'codec-toolkit',
  hash: 'hash-toolkit',
  pwdhash: 'hash-toolkit',
  htpasswd: 'hash-toolkit',
  aes: 'crypto-toolkit',
  symcipher: 'crypto-toolkit',
  'rsa-codec': 'crypto-toolkit',
  'jwt-decoder': 'crypto-toolkit',
  'http-status': 'dev-reference',
  'http-headers': 'dev-reference',
  'http-methods': 'dev-reference',
  ports: 'dev-reference',
  'mime-type': 'dev-reference',
  'linux-commands': 'dev-reference',
  'mqtt-cheatsheet': 'dev-reference',
  'virtual-card': 'identity-toolkit',
  'virtual-address': 'identity-toolkit',
  'random-ua': 'ua-toolkit',
  'ua-collection': 'ua-toolkit',
  'ua-parser': 'ua-toolkit',
  'sql-formatter': 'code-format-toolkit',
  'web-formatter': 'code-format-toolkit',
  'regex-tester': 'regex-toolkit',
  'regex-escape': 'regex-toolkit',
  radix: 'dev-calc-toolkit',
  'file-size': 'dev-calc-toolkit',
  'crc-calc': 'dev-calc-toolkit',
  'ppi-calc': 'dev-calc-toolkit',
  'my-ip': 'ip-toolkit',
  'ip-info': 'ip-toolkit',
  'ip-nearby': 'ip-toolkit',
  'ip-number': 'ip-toolkit',
  'subnet-mask': 'ip-toolkit',
  'random-ip': 'ip-toolkit',
  'mac-address': 'ip-toolkit',
  'dns-records': 'site-diagnosis-toolkit',
  'ns-lookup': 'site-diagnosis-toolkit',
  'site-links': 'site-diagnosis-toolkit',
  'seo-check': 'site-diagnosis-toolkit',
  'resp-headers': 'site-diagnosis-toolkit',
  webcheck: 'site-diagnosis-toolkit',
  uuid: 'random-toolkit',
  'random-number': 'random-toolkit',
  'password-generator': 'random-toolkit',
  'proxy-link': 'link-parser-toolkit',
  'thunder-url': 'link-parser-toolkit',
  'torrent-magnet': 'link-parser-toolkit',
  'type7-cisco': 'link-parser-toolkit',
  'shield-badge': 'webmaster-toolkit',
  'robots-generator': 'webmaster-toolkit',
  'browser-info': 'browser-toolkit',
  'cookie-viewer': 'browser-toolkit',
};

export const resolveToolId = (id: string): string => LEGACY_TOOL_IDS[id] ?? id;

/** 旧工具 ID → 合并后工具箱内的页签 mode，保证 /tools/jwt-decoder 直达 JWT 页签。 */
export const LEGACY_TOOL_MODES: Record<string, string> = {
  'json-formatter': 'format',
  'json-query': 'path',
  jsonpath: 'path',
  'json-schema': 'schema',
  'json-diff': 'diff',
  'yaml-to-json': 'convert',
  'xml-to-json': 'convert',
  'csv-to-json': 'convert',
  'json-to-yaml': 'convert',
  'json-to-xml': 'convert',
  'json-to-csv': 'convert',
  'yaml-properties': 'convert',
  'format-converter': 'convert',
  base64: 'base64',
  'url-codec': 'url',
  unicode: 'unicode',
  'hex-text': 'hex',
  'js-escape': 'js-escape',
  'base-codec': 'base-n',
  'gzip-codec': 'gzip',
  'morse-codec': 'morse',
  hash: 'hash',
  pwdhash: 'pwdhash',
  htpasswd: 'htpasswd',
  aes: 'aes',
  symcipher: 'symcipher',
  'rsa-codec': 'rsa',
  'jwt-decoder': 'jwt',
  'virtual-card': 'card',
  'virtual-address': 'address',
  'random-ua': 'random',
  'ua-collection': 'collection',
  'ua-parser': 'parser',
  'sql-formatter': 'sql',
  'web-formatter': 'web',
  'http-status': 'http-status',
  'http-headers': 'http-headers',
  'http-methods': 'http-methods',
  ports: 'ports',
  'mime-type': 'mime-type',
  'regex-tester': 'tester',
  'regex-escape': 'escape',
  radix: 'radix',
  'file-size': 'file-size',
  'crc-calc': 'crc',
  'ppi-calc': 'ppi',
  'my-ip': 'my',
  'ip-info': 'query',
  'ip-nearby': 'nearby',
  'ip-number': 'number',
  'subnet-mask': 'subnet',
  'random-ip': 'generators',
  'mac-address': 'generators',
  'linux-commands': 'linux-commands',
  'mqtt-cheatsheet': 'mqtt',
  'dns-records': 'dns',
  'ns-lookup': 'ns',
  'site-links': 'links',
  'seo-check': 'seo',
  'resp-headers': 'headers',
  webcheck: 'webcheck',
  uuid: 'uuid',
  'random-number': 'number',
  'password-generator': 'password',
  'proxy-link': 'proxy-link',
  'thunder-url': 'thunder-url',
  'torrent-magnet': 'torrent-magnet',
  'type7-cisco': 'type-7',
  'shield-badge': 'badge',
  'robots-generator': 'robots',
  'browser-info': 'info',
  'cookie-viewer': 'cookie',
};

/** 旧链接解析：目标工具箱 + 应激活的页签。 */
export const resolveToolTarget = (id: string): { toolId: string; mode?: string } => {
  const toolId = resolveToolId(id);
  const mode = LEGACY_TOOL_MODES[id];
  return mode ? { toolId, mode } : { toolId };
};

export const getTool = (id: string): ToolMeta | undefined => TOOL_MAP.get(resolveToolId(id));

export const getToolsByIds = (ids: readonly string[], limit = Number.POSITIVE_INFINITY): ToolMeta[] => {
  const seen = new Set<string>();
  const tools: ToolMeta[] = [];
  for (const id of ids) {
    const tool = getTool(id);
    if (!tool || seen.has(tool.id)) continue;
    seen.add(tool.id);
    tools.push(tool);
    if (tools.length >= limit) break;
  }
  return tools;
};

export const toolPath = (id: string): string => `/tools/${resolveToolId(id)}`;

export const getToolsByCategory = (category: CategoryId): ToolMeta[] =>
  TOOLS.filter((tool) => tool.category === category);

export const FEATURED_TOOLS = TOOLS.filter((tool) => tool.featured);

export const searchTools = (query: string, locale: Locale = 'zh'): ToolMeta[] => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return TOOLS;

  const terms = keyword.split(/\s+/).filter(Boolean);

  return TOOLS.map((tool) => {
    const name = tool.name.toLowerCase();
    const nameEn = (tool.nameEn ?? '').toLowerCase();
    const aliases = (tool.aliases ?? []).join(' ').toLowerCase();
    const tags = tool.tags.join(' ').toLowerCase();
    const description = [tool.description, tool.descriptionEn ?? ''].join(' ').toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (name === term || (nameEn && nameEn === term)) score += 40;
      if ((tool.aliases ?? []).some((alias) => alias.toLowerCase() === term)) score += 30;

      if (name.startsWith(term) || (nameEn && nameEn.startsWith(term))) score += 15;
      else if (name.includes(term) || nameEn.includes(term)) score += 10;

      if (aliases.includes(term)) score += 6;
      if (tool.tags.some((tag) => tag.toLowerCase() === term)) score += 8;
      else if (tags.includes(term)) score += 4;
      if (description.includes(term)) score += 1;
    }

    return { tool, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || compareToolName(
      { name: toolName(a.tool, locale) },
      { name: toolName(b.tool, locale) },
    ))
    .map((item) => item.tool);
};
