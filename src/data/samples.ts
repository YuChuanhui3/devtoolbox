export const SAMPLE_JSON =
  '{"name":"qwen","age":3,"tags":["ai","tools"],"profile":{"city":"Hangzhou","active":true}}';

export const SAMPLE_JSON_PRETTY = `{
  "name": "qwen",
  "age": 3,
  "tags": ["ai", "tools"],
  "profile": {
    "city": "Hangzhou",
    "active": true
  }
}`;

export const SAMPLE_YAML = `name: qwen
age: 3
tags:
  - ai
  - tools
profile:
  city: Hangzhou
  active: true
`;

export const SAMPLE_PROPERTIES = `# 应用配置示例（标准 Java Properties）
app.name=DevToolbox
app.version=1.0.0
server.host=localhost
server.port=8080
# 数组下标是 Spring 扩展语法，原生 Properties 只存字面键
features.tags[0]=json
features.tags[1]=yaml
db.enabled=true
# \\uXXXX 为 Unicode 转义
greeting=Hello \\u4e16\\u754c`;

export const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<user id="1">
  <name>qwen</name>
  <age>3</age>
  <tags>
    <tag>ai</tag>
    <tag>tools</tag>
  </tags>
</user>`;

export const SAMPLE_JSON_ARRAY = `[
  { "name": "a", "age": 1 },
  { "name": "b", "age": 2 },
  { "name": "c", "age": 3 }
]`;

export const SAMPLE_JSON_TO_CODE = `{
  "user_id": 1001,
  "user_name": "admin",
  "is_active": true,
  "tags": ["vip", "new"],
  "metadata": null
}`;

export const SAMPLE_JSON_DIFF_LEFT = `{
  "id": 1001,
  "name": "DevToolbox",
  "version": "1.0.0",
  "tags": ["json", "format"],
  "author": {
    "name": "Qwen",
    "email": "old@example.com"
  },
  "deprecated": false
}`;

export const SAMPLE_JSON_DIFF_RIGHT = `{
  "id": 1001,
  "name": "DevToolbox",
  "version": "1.1.0",
  "tags": ["json", "format", "diff"],
  "author": {
    "name": "Qwen",
    "email": "hello@example.com",
    "homepage": "https://example.com"
  },
  "license": "MIT"
}`;

export const SAMPLE_CSV = `name,age,city
a,1,Hangzhou
b,2,Shanghai
c,3,Beijing`;

export const SAMPLE_QUERY = 'name=qwen&age=3&from=hangzhou&tag=ai&tag=tools';

export const SAMPLE_JSONPATH_INPUT = `{
  "data": {
    "list": [
      { "name": "a", "score": 90 },
      { "name": "b", "score": 82 },
      { "name": "c", "score": 75 }
    ]
  }
}`;

export const SAMPLE_JSONPATH = '$.data.list[*].name';

export const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

export const SAMPLE_UNICODE = '你好，DevToolbox 👋';

export const SAMPLE_HEX = 'Hello, 世界';

export const SAMPLE_URL =
  'https://www.example.com:8443/path/demo?name=qwen&age=3#section';

export const SAMPLE_REGEX_PATTERN = '\\d{3}-?\\d{4}-?\\d{4}';
export const SAMPLE_REGEX_TEXT = '电话：13800138000，备用：13900139000，客服：400-800-8888';

export const SAMPLE_SQL =
  "select u.id,u.name,count(o.id) as order_count from users u left join orders o on o.user_id=u.id where u.status='active' group by u.id,u.name order by order_count desc;";

export const SAMPLE_WEB_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>DevToolbox</title>
</head>
<body>
<!-- 示例卡片 -->
<section class="card" data-id="1">
<h1>HTML 格式化</h1>
<p>支持缩进、压缩、语法高亮与错误定位。</p>
<button type="button">开始使用</button>
</section>
</body>
</html>`;

export const SAMPLE_WEB_CSS = `:root{--accent:#2196f3;--radius:12px}
.card { padding: 20px; border-radius: var(--radius); background: #fff; box-shadow: 0 8px 24px rgba(0, 0, 0, .08); }
.card h1 {
  color: var(--accent);
  font-size: 20px;
}
@media (max-width: 640px) {
  .card { padding: 14px; }
}`;

export const SAMPLE_WEB_JS = `// DevToolbox 代码格式化示例
const users = [
  { name: 'Alice', role: 'admin' },
  { name: 'Bob', role: 'editor' },
];

function summarize(list) {
  return list.map(({ name, role }) => \`\${name} (\${role})\`).join(', ');
}

if (users.length > 0) {
  console.log(summarize(users));
}`;

export const SAMPLE_DIFF_LEFT = `function greet(name) {
  const message = "Hello, " + name;
  console.log(message);
  return message;
}`;

export const SAMPLE_DIFF_RIGHT = `function greet(name, punctuation = "!") {
  const message = \`Hello, \${name}\${punctuation}\`;
  console.log(message);
  return message;
}`;

export const SAMPLE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const SAMPLE_TEXT_DIFF_LEFT = `产品于上周发布第一版。
本次更新包含三项改动：优化了搜索体验，修复了导出问题。
感谢所有用户的反馈与支持。`;

export const SAMPLE_TEXT_DIFF_RIGHT = `产品于本周发布第二版。
本次更新包含四项改动：优化了搜索体验，修复了导出问题，新增收藏同步。
感谢所有用户的反馈与支持！`;

export const SAMPLE_CRON = '0 9 * * 1-5';

export const SAMPLE_HTML = `<div class="article">
  <style>.title { color: red; }</style>
  <script>alert("xss")</script>
  <h1 class="title">标题</h1>
  <p>这是一段 <strong>富文本</strong> 内容。<br />换行后的内容。</p>
  <ul>
    <li>列表项 1</li>
    <li>列表项 2</li>
  </ul>
</div>`;

export const SAMPLE_AES_TEXT = '这是一段需要加密的敏感文本，请勿在真实场景使用弱口令。';

export const SAMPLE_MULTILINE = `  apple
banana

apple
cherry

  banana  `;

export const MARKDOWN_SAMPLE_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iMjIwIj48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjIyMCIgcng9IjI0IiBmaWxsPSIjMjE5NmYzIi8+PHRleHQgeD0iMzIwIiB5PSIxMjAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+TWFya2Rvd24g56S65L6L5Zu+54mHPC90ZXh0Pjwvc3ZnPg==';

export const SAMPLE_MARKDOWN = `# Markdown 实时渲染示例

这是一个 **加粗文本**，这是 *斜体文本*，这是 ~~删除线~~，这是 \`行内代码\`。

## 列表

- 列表项 1
- 列表项 2
- 列表项 3

## 任务列表

- [x] 已完成任务
- [ ] 未完成任务

## 代码

\`\`\`js
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}

greet("DevToolbox");
\`\`\`

## 表格

| 名称 | 类型 | 说明 |
|---|---|---|
| JSON | 数据格式 | 结构化数据 |
| Markdown | 文档格式 | 轻量标记语言 |
| WebP | 图像格式 | 体积更小的图片格式 |

## 引用

> 这是一段引用文本。预览内容已进行安全过滤，不会执行脚本。

## 链接与图片

[访问示例站点](https://example.com)

![Markdown 示例图片](${MARKDOWN_SAMPLE_IMAGE})
`;
