# RAG + 知识库 流程截图 (2026-06-02)

## 截图清单（5/5）

| # | 文件 | 状态 | 实际呈现内容 |
|---|------|------|-------------|
| 1 | 01-kb-list.png | OK | `/admin/kb` 知识库管理后台，默认"文档列表"Tab，可见已有文档（损坏的知识库_原始、test、default 等） |
| 2 | 02-doc-upload.png | OK | 切换到"上传文档"Tab，展示拖拽上传表单 + 支持格式说明 |
| 3 | 03-upload-progress.png | OK | 选中 test.txt 后入队显示，点击"上传"按钮触发上传（API 1s 内完成，截图可能落在"上传中"瞬间） |
| 4 | 04-rag-search.png | OK | 主对话页（`/`）发送"知识库里有几篇文档？"，LLM 自答（**未触发 RAG**，回答"我没有文档库"） |
| 5 | 05-citation.png | OK | KB 管理后台"检索测试"Tab，输入"SimpleAgent"后的检索结果。**当前 API 返回 0 条结果**（向量/Embedding 暂未生效） |

## 真实状态报告

### 1. 知识库管理后台（已实现）
- 入口：`/admin/kb`
- 5 个 Tab：文档列表 / 上传文档 / 索引管理 / 检索测试 / 数据统计
- 后端 API：`/api/admin/knowledge/*`
- 上传 API 验证通过：`POST /api/admin/knowledge/docs` 返回 200

### 2. 文档列表（截图 1）
- 已有 19 篇文档分布在 4 个知识库
- 部分知识库名因编码问题显示"损坏的知识库_原始"

### 3. 上传流程（截图 2-3）
- 前端：拖拽区域 + 隐藏 `<input type=file multiple>`
- 后端：`POST /api/admin/knowledge/docs` (multipart/form-data)
- 实测：5KB 文本上传 < 1s 完成，进度条瞬间消失

### 4. 主对话页与 RAG 集成（截图 4）
- **主对话页无 RAG 集成**：`/api/chat` 直接调用 MiniMax-M2.7，未注入知识库检索结果
- LLM 不知道存在内部知识库，会回答"我没有文档库"
- 仅 `useSearchEnhanced` Hook 提供**联网搜索**（web search），非 KB RAG

### 5. 引用/检索结果（截图 5）
- **KB 检索测试 API 返回 0 条结果**：
  - 端点：`GET /api/admin/knowledge/search?q=...`
  - 实测 `q=SimpleAgent` / `q=架构` / `q=六层` 均返回 `{ count: 0, results: [] }`
  - 推测原因：向量数据库（Qdrant）或 Embedding 模型（mxbai-embed-large）暂未生效
- 前端检索测试 Tab 已实现结果展示（`<div>找到 N 条结果，耗时 Xms</div>`）
- 由于后端无结果，截图呈现"未找到相关结果"空态

### 6. 引用高亮
- 消息组件（`Message.tsx`）"引用"按钮 = 引用**当前消息内容到输入框**（Quote 操作），**非 RAG 引用**
- 整个前端代码库（`*.tsx`）无 RAG citation 展示组件
- 后端有 CitationAssembler（`domain/rag/CitationAssembler.js`）但未被聊天流程调用

## 验收缺陷（基于本次截图）

| 编号 | 描述 | 严重度 |
|------|------|--------|
| KB-1 | 主对话页未集成 RAG，KB 内容无法被 LLM 利用 | P0 |
| KB-2 | `/api/admin/knowledge/search` 返回 0 条结果 | P0 |
| KB-3 | 无 RAG 引用高亮组件 | P1 |

## 重跑命令

```bash
node scripts/journey-rag.mjs
```
