#!/usr/bin/env node
// scripts/rag-e2e-test.mjs
// RAG 端到端验证脚本
// 用途：创建测试 KB → 上传文档 → 验证检索 → 验证 chat 注入
//
// 用法：
//   node scripts/rag-e2e-test.mjs
//
// 已知 Bug（2026-06-04）：
//   ragService.js:_doRetrieve 调 QueryDecomposeService.decompose() 拿到
//   { subQuestions: [{id, question, dimension, order, dependOn, priority}] }
//   后，把对象数组直接传给 generateEmbedding()，导致 simpleEmbed 调
//   text.toLowerCase() 时抛 TypeError。
//   修复：line 393 改为
//     subQueries = decomposeResult.subQuestions.map(q => q.question || q.query);

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BACKEND = process.env.BACKEND_URL || 'http://localhost:30000';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3001';

const log = (label, value) => console.log(`[${label}] ${value}`);

const main = async () => {
  console.log('=== RAG 端到端验证 ===');

  // 1. 创建测试 KB
  const kbResp = await fetch(`${BACKEND}/api/rag/kb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test KB (E2E)', description: 'RAG 验证用 KB' })
  });
  const kbJson = await kbResp.json();
  if (!kbJson.success) throw new Error('KB 创建失败: ' + JSON.stringify(kbJson));
  const kbId = kbJson.knowledgeBase.id;
  log('KB 创建', kbId);

  // 2. 上传测试文档
  const content = `SimpleAgent 项目有以下核心组件:
1. 商业级 AI 对话平台
2. 支持 SSE 流式响应
3. 内置 23 个工具
4. RAG 知识库检索
5. A2A Agent-to-Agent 协作
6. HITL 人机协作
7. MCP 工具协议
8. Grafana 监控
9. Prometheus 指标
10. 730+890 个测试`;
  const docResp = await fetch(`${BACKEND}/api/rag/kb/${kbId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'SimpleAgent-Components', content, type: 'text' })
  });
  const docJson = await docResp.json();
  log('文档上传', `${docJson.documentId} (chunks: ${docJson.chunks})`);

  // 3. 验证 search
  console.log('\n--- 步骤 3: search API ---');
  const searchResp = await fetch(`${BACKEND}/api/rag/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '工具有多少个', topK: 3 })
  });
  const searchJson = await searchResp.json();
  log('search count', searchJson.count || 0);
  log('search result', searchJson.results?.length > 0 ? 'hit' : 'miss');

  // 4. 验证 retrieve (单 KB)
  console.log('\n--- 步骤 4: retrieve API (单 KB) ---');
  const retrieveResp = await fetch(`${BACKEND}/api/rag/kb/${kbId}/retrieve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '工具有多少个', topK: 3, similarityThreshold: -1 })
  });
  const retrieveJson = await retrieveResp.json();
  if (retrieveJson.error) {
    log('retrieve', 'BUG: ' + retrieveJson.error.message);
  } else {
    log('retrieve count', retrieveJson.count || retrieveJson.results?.length || 0);
  }

  // 5. 验证 chat 路径 KB 注入（通过 debug-augment）
  console.log('\n--- 步骤 5: chat 路径 KB 注入 ---');
  const augResp = await fetch(`${BACKEND}/api/v1/debug-augment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '知识库里有多少个工具' }]
    })
  });
  const augJson = await augResp.json();
  log('intent', augJson.debug?.intent);
  log('confidence', augJson.debug?.confidence);
  log('ragInjected', augJson.debug?.ragInjected);
  log('kbCount', augJson.debug?.kbCount);

  // 6. 总结
  console.log('\n=== 总结 ===');
  const allPassed =
    kbJson.success &&
    docJson.success &&
    !retrieveJson.error &&
    augJson.debug?.ragInjected;
  if (allPassed) {
    console.log('✓ 全部通过：KB 创建 → 上传 → 检索 → 注入');
  } else {
    console.log('✗ 失败：详细见上方日志');
    console.log('\n已知 Bug：ragService.js retrieve() 在 QueryDecomposeService 集成处抛错');
    console.log('        修复: line 393 改为 .map(q => q.question || q.query)');
  }
  process.exit(allPassed ? 0 : 1);
};

main().catch(e => {
  console.error('异常:', e);
  process.exit(2);
});
