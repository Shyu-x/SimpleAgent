# RAG 核心面试题详解

> 本文档系统解答 RAG 开发中的高频面试题，涵盖向量检索、文档切片、记忆系统、生成控制等核心主题。

---

## 一、向量检索基础

### Q1: 稠密向量 vs 稀疏向量的区别

#### 核心概念

| 类型 | 定义 | 示例 | 适用场景 |
|------|------|------|----------|
| **稠密向量 (Dense)** | 所有维度都有值，通常是浮点数 | [0.23, -0.45, 0.89, ...] | 语义相似性搜索 |
| **稀疏向量 (Sparse)** | 大部分值为 0，只有少数维度有值 | [0, 0, 0, 0.95, 0, 0, 0.23, ...] | 关键词匹配、BM25 |

#### 技术原理

```javascript
// 稠密向量
// 由神经网络编码器生成（如 BERT、Sentence-BERT）
// 维度通常 384/768/1024/1536
const denseEmbedding = model.encode("什么是人工智能");
// 结果: [0.123, -0.456, 0.789, ..., 0.234]  // 1024 维浮点数

// 稀疏向量
// 通常是词频统计或 BM25 权重
// 只有词表中的词有值
const sparseVector = bm25.getScores("什么是人工智能");
// 结果: { "什么": 1.5, "是": 0.2, "人工": 2.3, "智能": 3.1 }
// 存储时可以只存储非零值: [{"term": "人工", "weight": 2.3}, ...]
```

#### 对比

| 维度 | 稠密向量 | 稀疏向量 |
|------|----------|----------|
| **语义理解** | ✅ 强 | ❌ 弱 |
| **关键词匹配** | ❌ 弱 | ✅ 强 |
| **专有名词** | 一般 | ✅ 强 |
| **计算方式** | 余弦相似度 | BM25 / TF-IDF |
| **存储大小** | 固定 768-1536 维 | 可变（按词存储） |
| **适合的 query** | 语义模糊、概念性 | 精确关键词匹配 |

#### 融合策略

```javascript
// 互补融合 - 兼顾语义和关键词
const hybridScore = 0.7 * denseSimilarity + 0.3 * sparseScore;

// RRF (Reciprocal Rank Fusion)
// 更鲁棒，不依赖具体分数
const rrfScore = (1 / (60 + denseRank)) + (1 / (60 + sparseRank));
```

#### 面试加分回答

```
"稠密向量适合语义相似性搜索，比如'苹果和橘子哪个更适合减肥'
这种需要理解语义的问题。而稀疏向量适合精确匹配，比如搜索
专有名词、型号、数量等。

实际项目中，我通常使用混合检索（Hybrid Search），用 0.7:0.3
的权重融合两种向量，兼顾语义理解和精确匹配。"
```

---

### Q2: 向量库检索出的 Top-K，K 值过大的负面影响

#### K 值过大的问题

```javascript
// K = 100 的问题
const results = await vectorDB.search(query, { topK: 100 });

// 问题 1: 上下文稀释
// LLM 看到的上下文包含太多无关信息
const context = `
相关文档1: ... (关于主题A)
相关文档2: ... (关于主题B)
...
相关文档100: ... (关于主题Z)
// 主题分散，LLM 难以聚焦
`;

// 问题 2: 生成成本增加
// Token 费用 = 输入 Token 数
// 100 个文档可能产生 5000+ token 的上下文

// 问题 3: 噪声引入
// 排名第 50-100 的文档质量可能很差
// 错误信息可能误导 LLM

// 问题 4: 延迟增加
// 传输、Rerank、处理时间都增加
```

#### 最佳实践

| K 设置 | 适用场景 | 理由 |
|--------|----------|------|
| **K=3~5** | 简单问答 | 精准、成本低 |
| **K=5~10** | 一般 RAG | 平衡（推荐） |
| **K=10~20** | 需要 Rerank | Rerank 会过滤 |
| **K>20** | 不推荐 | 噪声太多 |

```javascript
// 实际配置
const SEARCH_CONFIG = {
  // 阶段1: 召回阶段，多召回一些
  initialTopK: 20,

  // 阶段2: Rerank 后截断
  rerankTopK: 5,

  // 动态调整
  adaptiveK: (maxContextLength) => {
    // 根据 LLM 上下文限制动态计算
    const maxDocs = Math.floor(maxContextLength / avgDocLength);
    return Math.min(maxDocs, 10);
  }
};
```

---

### Q3: 余弦相似度 vs 欧氏距离

#### 数学定义

```javascript
// 余弦相似度 (Cosine Similarity)
// 衡量两个向量方向的相似性
// 范围: [-1, 1]，越接近 1 越相似
cosineSimilarity(A, B) = (A · B) / (|A| × |B|)

// 欧氏距离 (Euclidean Distance)
// 衡量两个向量的绝对距离
// 范围: [0, +∞)，越接近 0 越相似
euclideanDistance(A, B) = √(Σ(Ai - Bi)²)
```

#### 对比

| 维度 | 余弦相似度 | 欧氏距离 |
|------|------------|----------|
| **考虑因素** | 方向（不考虑 magnitude） | 方向 + 长度 |
| **向量长度敏感** | 不敏感 | 敏感 |
| **适用场景** | 语义相似（方向重要） | 聚类、分类（绝对位置重要） |
| **文本相似度** | ✅ 更常用 | 一般 |
| **词向量** | ✅ 常用 | 可用 |

#### 图示

```
向量 A = (1, 1)
向量 B = (2, 2)    // 与 A 方向相同，长度不同
向量 C = (-1, -1)  // 与 A 方向相反

余弦相似度:
cos(A, B) = 1.0    // 方向完全相同
cos(A, C) = -1.0   // 方向完全相反

欧氏距离:
dist(A, B) = √2 ≈ 1.41  // 距离较小
dist(A, C) = √8 ≈ 2.83  // 距离较大

结论:
- A 和 B 余弦相似度 = 1（方向相同，语义相似）
- 但欧氏距离 > 0（长度不同）
```

#### 何时用哪个？

```javascript
// 余弦相似度 - 文本语义相似
// "苹果水果" vs "苹果公司" → 方向可能不同
const queryEmbedding = model.encode("苹果");
const doc1 = model.encode("一种红色水果");    // 方向接近
const doc2 = model.encode("一家美国公司");    // 方向不同

cosineSimilarity(queryEmbedding, doc1) > cosineSimilarity(queryEmbedding, doc2)
// ✓ 正确识别语义相关性

// 欧氏距离 - 需要考虑向量 magnitude 的场景
// 如：词向量聚类、分类任务
// "很棒" vs "一般般棒" → 长度不同可能代表情感强度
```

#### 项目中的实现

```javascript
// backend/src/domain/rag/Reranker.js
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}
```

---

## 二、文档切片与预处理

### Q4: 为什么要对长文档切片？不切片有什么后果？

#### 切片的原因

```
文档长度: 50,000 字
不分片的问题:
┌─────────────────────────────────────────────────────────┐
│  1. 向量化失真                                          │
│     - 长文档语义复杂，压缩到单一向量会丢失细节              │
│     - 1000字的"技术文档" vs "水果" → 都变成 [0.1, ...]   │
│                                                         │
│  2. 检索精度下降                                        │
│     - 用户问"如何重置密码"                               │
│     - 长文档可能涵盖注册/登录/找回/重置多个主题             │
│     - 相关片段被无关内容稀释                              │
│                                                         │
│  3. 上下文长度限制                                      │
│     - LLM 通常有 4K/8K/128K 的上下文限制                 │
│     - 一个长文档可能超出限制                              │
│                                                         │
│  4. 检索粒度不细                                        │
│     - 用户只需要某一段内容                                │
│     - 返回整篇文档增加噪声                               │
└─────────────────────────────────────────────────────────┘
```

#### 切片策略

```javascript
// 固定长度切片
function fixedChunk(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
    if (i + chunkSize >= text.length) break;
  }
  return chunks;
}

// 语义切片（更智能）
function semanticChunk(text) {
  // 1. 先按段落分割
  const paragraphs = text.split(/\n\n+/);

  // 2. 按句子合并到合适长度
  const chunks = [];
  let currentChunk = [];

  for (const para of paragraphs) {
    const sentenceCount = countSentences(para);

    if (sentenceCount > 10) {
      // 长段落单独成块
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
      }
      chunks.push(para);
    } else if (getTokenCount(currentChunk + para) > 500) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [para];
    } else {
      currentChunk.push(para);
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
}
```

#### 不切片的后果

```javascript
// 后果 1: 语义模糊
const longDoc = "这篇文档先讲Python基础，包括变量、数据类型...";
const vector1 = embed("变量是存储值的容器...");
const vector2 = embed("这篇文档先讲Python基础...");
// 由于文档太长，向量化时噪声很大

// 后果 2: 检索不精准
query: "如何定义函数"
longDocResult: [
  { doc: "第一章 Python基础...第三章 函数...第五章 类", score: 0.85 }
  // 整篇文档都相关，但用户需要的是"函数定义"那一段
]

// 后果 3: Token 溢出
// LLM 上下文 8K，把整本书塞进去就爆了
```

---

### Q5: 切片重叠区域的作用？如何确定重叠比例？

#### 重叠的作用

```
切片 1: [0 ──────────────────── 500]
              重叠 [450 ───────────────── 950] 切片 2
                                重叠 [900 ────────────── 1400] 切片 3
```

```javascript
// 重叠的作用：防止语义截断

原文: "当用户登录成功后，系统会跳转到首页。如果用户没有登录，点击个人中心会跳转到登录页。请注意，游客用户只能浏览，不能购买。"

切片 1（不含"请注意"）: "当用户登录成功后，系统会跳转到首页。如果用户没有登录，点击个人中心会跳转到登录页。"
切片 2（含"请注意"）: "个人中心会跳转到登录页。请注意，游客用户只能浏览，不能购买。"

查询: "游客能购买吗？"
切片 1 → 语义不完整，检索不到
切片 2 → "请注意，游客用户只能浏览，不能购买" → 命中！
```

#### 重叠比例如何确定？

| 场景 | 重叠比例 | 理由 |
|------|----------|------|
| 叙事性文档（文章、新闻） | 10-20% | 语义相对独立 |
| 技术文档（教程、API） | 20-30% | 上下文关联强 |
| 对话/聊天记录 | 30-50% | 上下文极强 |
| 问答类文档 | 5-10% | 独立性强 |

```javascript
// 动态重叠计算
function calculateOverlap(docLength, chunkSize) {
  // 经验公式
  const baseOverlapRatio = 0.2;  // 基础 20%

  // 文档越长，重叠比例可以适当降低
  const lengthFactor = Math.min(docLength / 10000, 1);

  // 语义连贯性强的文档，重叠比例提高
  const coherenceFactor = 1 + (hasHighCoherence(docLength) ? 0.1 : 0);

  const finalRatio = baseOverlapRatio * (1 - lengthFactor * 0.5) * coherenceFactor;

  return Math.round(chunkSize * finalRatio);
}

// 项目配置
const CHUNK_CONFIG = {
  chunkSize: 500,        // token 数（不是字符数）
  overlapRatio: 0.2,     // 20% 重叠
  minChunkLength: 50,    // 最小切片长度
  separator: "\n\n",    // 语义分隔符
};
```

---

## 三、RAG 生成与幻觉控制

### Q6: 如何在 Prompt 中设定边界条件防止幻觉？

#### 核心策略

```javascript
// 1. 明确告知模型"我不知道"
const SYSTEM_PROMPT = `
你是一个基于检索文档回答问题的助手。

重要规则：
1. 如果检索到的文档不包含回答问题所需的信息，直接回答"我没有找到相关信息"
2. 不要编造或推测文档中没有的信息
3. 如果信息部分不足，先说明已知部分，再指出不足之处
4. 回答时使用"[来源X]"标注参考的文档

已知信息：
{context}

用户问题：
{question}
`;

// 2. 强制引用 (Force Citation)
const FORCE_CITATION_PROMPT = `
你必须基于以下文档回答问题。如果文档中没有相关信息，必须明确说明。

文档：
{context}

要求：
- 每句话都要标注来源，格式：[文档X]
- 不能回答文档中没有的信息
- 格式示例："根据[文档1]，XXX是因为..."
`;

// 3. 不确定时的处理
const UNCERTAINTY_PROMPT = `
回答问题时：
1. 高置信度（检索到明确相关内容）：正常回答
2. 中置信度（有部分相关信息）：回答部分+指出不确定
3. 低置信度（没有检索到相关内容）：直接说"没有找到相关信息"

置信度判断标准：
- 高：检索到 3+ 个高度相关的文档片段
- 中：检索到 1-2 个相关片段
- 低：没有检索到明确相关的文档
`;
```

#### 实践代码

```javascript
// backend/src/domain/rag/CitationAssembler.js
class CitationAssembler {
  /**
   * 组装带边界控制的 Prompt
   */
  assemblePrompt(query, retrievedDocs, options = {}) {
    const {
      includeInstructions = true,
      maxSourceCount = 5
    } = options;

    // 截断文档数量
    const sources = retrievedDocs.slice(0, maxSourceCount);

    // 构建上下文
    const context = sources.map((doc, idx) =>
      `[文档${idx + 1}]: ${doc.content}`
    ).join('\n\n');

    // 边界指令
    const instructions = includeInstructions ? `
参考以下文档回答用户问题。如果文档中没有相关信息，请明确说明。

[规则]
1. 只能使用文档中包含的信息
2. 不能编造或推测
3. 使用[文档X]标注来源
[/规则]
` : '';

    return `${instructions}
文档：
${context}

问题：${query}

回答：`；
  }
}
```

#### 高级技巧

```javascript
// 1. Self-Check (生成后自检)
async function generateWithSelfCheck(query, context) {
  const answer = await llm.chat([
    { role: 'user', content: `问题: ${query}\n\n文档: ${context}` }
  ]);

  // 让 LLM 自检
  const checkPrompt = `
请检查以下回答是否仅基于提供的信息，不要包含任何额外推断：

回答：${answer}
文档：${context}

如果回答中有任何信息不是来自文档，请指出。
`;

  const checkResult = await llm.chat([{ role: 'user', content: checkPrompt }]);

  if (checkResult.includes("没有") || checkResult.includes("全部基于")) {
    return answer;  // 通过检查
  }

  return "我没有找到与您问题相关的具体信息。";
}

// 2. 不确定性估计
function estimateConfidence(retrievedDocs) {
  if (retrievedDocs.length === 0) return 'low';

  const avgScore = retrievedDocs.reduce((sum, d) => sum + d.score, 0) / retrievedDocs.length;

  if (avgScore > 0.8 && retrievedDocs.length >= 3) return 'high';
  if (avgScore > 0.6 || retrievedDocs.length >= 1) return 'medium';
  return 'low';
}
```

---

### Q7: HyDE 原理与优势

#### HyDE (Hypothetical Document Embeddings)

**核心思想**：先用 LLM 生成一个"假设性答案"，再用这个答案去检索

```
传统 RAG:
Query: "什么是机器学习" → 直接检索 → 可能召回不精准

HyDE:
Query: "什么是机器学习"
  ↓
Step 1: LLM 生成假设性答案（可能不准确但语义相关）
假设答案: "机器学习是人工智能的一个分支，通过算法让计算机从数据中学习并改进..."
  ↓
Step 2: 用假设答案的向量去检索
检索: embed(假设答案) → 匹配到真实相关文档
  ↓
Step 3: 基于真实文档回答
```

#### 代码实现

```javascript
// HyDE 实现
async function hydeRetrieve(query, embeddingModel, vectorDB) {
  // Step 1: 生成假设性答案
  const hypotheticalAnswer = await llm.chat([{
    role: 'user',
    content: `请用一个简短段落回答以下问题，不需要完全正确，但要有语义相关性：

问题：${query}

假设性回答：`
  }]);

  // Step 2: 用假设答案的向量检索
  const queryEmbedding = await embeddingModel.embed(hypotheticalAnswer);
  const results = await vectorDB.search(queryEmbedding, { topK: 10 });

  return results;
}

// Step 3: 判断是否使用 HyDE
async function adaptiveRetrieve(query, embeddingModel, vectorDB) {
  // 模糊问题用 HyDE，精确问题不用
  const isAmbiguous = checkAmbiguity(query);

  if (isAmbiguous) {
    console.log('使用 HyDE 检索');
    return hydeRetrieve(query, embeddingModel, vectorDB);
  } else {
    console.log('使用普通检索');
    const embedding = await embeddingModel.embed(query);
    return vectorDB.search(embedding, { topK: 10 });
  }
}

function checkAmbiguity(query) {
  // 模糊特征：概念性、无具体实体
  const ambiguousKeywords = ['什么', '如何', '为什么', '概念', '原理'];
  const specificKeywords = ['型号', '版本', '日期', '具体', '哪个'];

  const hasAmbiguous = ambiguousKeywords.some(k => query.includes(k));
  const hasSpecific = specificKeywords.some(k => query.includes(k));

  return hasAmbiguous && !hasSpecific;
}
```

#### HyDE 适用场景

| 适用 | 不适用 |
|------|--------|
| 模糊概念性问题 | 精确查找（如型号、数量） |
| 开放式问题 | 需要精确事实的问题 |
| 缺少明确关键词的查询 | 专业术语检索 |

---

## 四、索引与更新

### Q8: 文档局部更新时，如何增量索引避免全量重算？

#### 增量索引策略

```javascript
// 1. 基于文档 ID 的版本管理
class IncrementalIndexManager {
  constructor(vectorDB) {
    this.vectorDB = vectorDB;
    this.docVersions = new Map();  // docId -> version
    this.chunkIndex = new Map();   // chunkId -> { docId, version, vector }
  }

  // 增量更新单个文档
  async updateDocument(docId, newContent, embeddingModel) {
    // 获取旧版本信息
    const oldVersion = this.docVersions.get(docId) || 0;
    const newVersion = oldVersion + 1;

    // 切片新文档
    const newChunks = this.chunkDocument(newContent);

    // 删除旧 chunks
    const chunksToDelete = this.findChunksByDocId(docId);
    for (const chunkId of chunksToDelete) {
      await this.vectorDB.delete(chunkId);
      this.chunkIndex.delete(chunkId);
    }

    // 索引新 chunks
    for (let i = 0; i < newChunks.length; i++) {
      const chunkId = `${docId}_chunk_${i}`;
      const vector = await embeddingModel.embed(newChunks[i]);

      await this.vectorDB.insert({
        id: chunkId,
        vector,
        metadata: {
          docId,
          chunkIndex: i,
          version: newVersion,
          content: newChunks[i]
        }
      });

      this.chunkIndex.set(chunkId, { docId, version: newVersion });
    }

    // 更新版本
    this.docVersions.set(docId, newVersion);
  }

  // 只更新变化的 chunks
  async partialUpdate(docId, changes, embeddingModel) {
    const existingChunks = this.findChunksByDocId(docId);

    for (const change of changes) {
      if (change.type === 'update') {
        // 更新单个 chunk
        const chunkId = `${docId}_chunk_${change.chunkIndex}`;
        const newVector = await embeddingModel.embed(change.newContent);

        await this.vectorDB.update(chunkId, {
          vector: newVector,
          metadata: { content: change.newContent }
        });
      } else if (change.type === 'delete') {
        // 删除 chunk
        await this.vectorDB.delete(`${docId}_chunk_${change.chunkIndex}`);
      }
    }
  }
}
```

#### 2. 时间戳 + 增量同步

```javascript
// 方案 2: 基于时间戳的增量同步
class TimestampIndexManager {
  async sync() {
    const lastSyncTime = await this.getLastSyncTime();

    // 只获取上次同步后变化的文档
    const changedDocs = await this.getDocsModifiedAfter(lastSyncTime);

    for (const doc of changedDocs) {
      await this.reindexDocument(doc);
    }

    await this.updateLastSyncTime(Date.now());
  }
}
```

#### 3. 向量库的更新操作

```javascript
// 主流向量库的增量操作

// Pinecone
await pinecone.index('my-index').upsert({
  id: 'chunk-123',
  vector: [0.1, 0.2, ...],
  metadata: { text: 'chunk content', docId: 'doc-1' }
});

// Milvus
await milvus.insert({
  collection_name: 'docs',
  records: [{
    id: 'chunk-123',
    vector: [0.1, 0.2, ...],
    fields: { text: 'chunk content', docId: 'doc-1' }
  }]
});

// Qdrant
await qdrant.upsert('docs', {
  points: [{
    id: 'chunk-123',
    vector: [0.1, 0.2, ...],
    payload: { text: 'chunk content', docId: 'doc-1' }
  }]
});
```

---

## 五、长短期记忆设计

### Q9: 长短期记忆的提取、压缩与冲突更新机制

#### 三层记忆架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent Memory System                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Working Memory (短期)                      │   │
│  │  LLM 直接看到的上下文                                        │   │
│  │  - 系统提示 (~2K tokens)                                    │   │
│  │  - 当前对话 (~8K tokens)                                    │   │
│  │  - 提取自 Session Memory 的近期内容                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓ 提取                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Session Memory (中期)                       │   │
│  │  当前会话的记忆                                              │   │
│  │  - 最近 N 轮对话 (滑动窗口)                                  │   │
│  │  - 关键决策点                                               │   │
│  │  - 未解决的问题                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓ 压缩/摘要                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Persistent Memory (长期)                    │   │
│  │  跨会话的持久记忆                                           │   │
│  │  - Session Notes (会话摘要)                                │   │
│  │  - 用户偏好设置                                             │   │
│  │  - 知识库检索结果                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### 记忆提取机制

```javascript
class MemoryExtractor {
  /**
   * 从对话历史中提取关键信息
   */
  extract(conversation) {
    const extraction = {
      decisions: [],      // 关键决策
      facts: [],         // 用户提供的事实
      preferences: [],   // 用户偏好
      questions: [],     // 未解决的问题
      entities: []       // 提到的实体
    };

    for (const message of conversation) {
      // 1. 提取决策
      if (this.isDecisionPoint(message)) {
        extraction.decisions.push({
          content: message.content,
          timestamp: message.timestamp
        });
      }

      // 2. 提取事实
      const facts = this.extractFacts(message.content);
      extraction.facts.push(...facts);

      // 3. 提取偏好
      const preferences = this.extractPreferences(message.content);
      extraction.preferences.push(...preferences);

      // 4. 提取实体
      const entities = this.extractEntities(message.content);
      extraction.entities.push(...entities);
    }

    return extraction;
  }

  /**
   * 判断是否是决策点
   */
  isDecisionPoint(message) {
    const decisionKeywords = ['决定', '选择', '采用', '使用', '安排'];
    return decisionKeywords.some(k => message.content.includes(k));
  }
}
```

#### 记忆压缩机制

```javascript
class MemoryCompressor {
  /**
   * 压缩记忆，控制 token 数量
   */
  async compress(memory, maxTokens) {
    const currentTokens = this.countTokens(memory);

    if (currentTokens <= maxTokens) {
      return memory;
    }

    // 分层压缩
    return {
      decisions: await this.summarizeDecisions(memory.decisions),
      facts: this.pruneOldFacts(memory.facts, maxTokens * 0.3),
      preferences: memory.preferences,  // 保留所有偏好
      questions: memory.questions,      // 保留未解决问题
    };
  }

  /**
   * 决策摘要
   */
  async summarizeDecisions(decisions) {
    if (decisions.length <= 5) return decisions;

    const prompt = `
总结以下决策要点（保留每个决策的核心）：
${decisions.map(d => `- ${d.content}`).join('\n')}

格式：
[决策摘要]
`;

    const summary = await llm.chat([{ role: 'user', content: prompt }]);
    return [{ content: summary, timestamp: decisions[0].timestamp }];
  }

  /**
   * 过期事实清理
   */
  pruneOldFacts(facts, maxCount) {
    // 保留最新的事实
    return facts.slice(-maxCount);
  }
}
```

#### 冲突更新机制

```javascript
class ConflictResolver {
  /**
   * 处理记忆冲突
   */
  resolve(newMemory, existingMemory) {
    const resolved = { ...existingMemory };

    // 1. 用户偏好冲突：新值覆盖旧值
    for (const pref of newMemory.preferences) {
      const existing = resolved.preferences.find(
        p => p.key === pref.key
      );

      if (existing) {
        // 记录冲突历史
        pref.previousValue = existing.value;
        pref.updateReason = 'user_update';
      }

      resolved.preferences = this upsertPreference(resolved.preferences, pref);
    }

    // 2. 事实冲突：保留最新 + 标记冲突
    for (const fact of newMemory.facts) {
      const conflicting = resolved.facts.find(
        f => f.entity === fact.entity && f.attribute === fact.attribute
      );

      if (conflicting && conflicting.value !== fact.value) {
        // 事实冲突，保留两者
        conflicting.hasConflict = true;
        conflicting.alternativeValues = [
          conflicting.value,
          fact.value
        ];
        conflicting.latestValue = fact.value;
      } else {
        resolved.facts.push(fact);
      }
    }

    // 3. 决策冲突：不覆盖，保留历史
    resolved.decisions.push(...newMemory.decisions);

    return resolved;
  }
}
```

#### 极端情绪检测与干预

```javascript
class EmotionalIntervention {
  /**
   * 检测极端情绪
   */
  detectEmotion(message) {
    const emotionKeywords = {
      anger: ['愤怒', '生气', '讨厌', '滚', '白痴'],
      sadness: ['难过', '伤心', '失望', '沮丧', '绝望'],
      anxiety: ['焦虑', '担心', '害怕', '紧张', '不安']
    };

    const scores = {};
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      scores[emotion] = keywords.reduce(
        (sum, k) => sum + (message.content.includes(k) ? 1 : 0),
        0
      );
    }

    const maxEmotion = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      emotion: maxEmotion[0],
      intensity: maxEmotion[1],
      isExtreme: maxEmotion[1] >= 2
    };
  }

  /**
   * 情绪干预 - 不中断对话流
   */
  async intervene(emotion, currentResponse) {
    const strategies = {
      anger: {
        // 冷静策略：不反驳，表示理解
        response: '我理解您可能感到 frustration，让我们换个话题...',
        action: 'delay_escalation'
      },
      sadness: {
        // 共情策略：承认情绪，提供支持
        response: '听起来您最近不太顺利，想聊聊发生了什么吗？',
        action: 'empathetic_support'
      },
      anxiety: {
        // 简化策略：降低复杂度，提供明确指引
        response: '别担心，我们可以一步一步来解决这个问题。',
        action: 'reduce_complexity'
      }
    };

    const strategy = strategies[emotion];

    // 不替换原回复，而是追加温和干预
    return `${currentResponse}\n\n${strategy.response}`;
  }
}
```

---

## 六、异步编程与推理框架

### Q10: asyncio 异步编程的优势

#### 为什么需要 asyncio？

```javascript
// 场景：并发调用 100 个 LLM API

// 同步方式 - 串行执行
async function syncCalls() {
  const results = [];
  for (const prompt of prompts) {
    const result = await callLLM(prompt);  // 每次等待 1 秒
    results.push(result);                   // 总计 100 秒
  }
  return results;
}

// 异步方式 - 并发执行
async function asyncCalls() {
  const results = await Promise.all(
    prompts.map(prompt => callLLM(prompt))  // 全部并行
  );
  return results;                           // 总计 ~1 秒
}
```

#### asyncio 核心概念

```javascript
// 1. Event Loop - 事件循环
// 单线程处理多个并发任务

// 2. Coroutine - 协程
// async 函数就是协程，可以在等待时让出执行权
async function fetchData() {
  const response = await fetch(url);  // 等待时可以做其他事
  return response.json();
}

// 3. Task - 任务
// 将协程包装成可追踪的任务
const task = asyncio.createTask(fetchData());

// 4. Gather - 收集
// 并发执行多个协程
const results = await asyncio.gather(
  task1(),
  task2(),
  task3()
);
```

#### 高并发优势

```javascript
// Express 同步方式
app.post('/api/chat', async (req, res) => {
  // 如果有 1000 个并发请求
  // 每个请求都会占用一个线程/事件循环
  // 线程池耗尽 → 请求排队 → 延迟增加
});


// SSE 流式响应的异步处理
app.post('/api/chat/stream', async (req, res) => {
  // 设置 SSE 头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // 异步生成响应
  const stream = await callLLMStream(req.body.message);

  stream.on('data', (chunk) => {
    res.write(chunk);  // 不阻塞，继续处理其他请求
  });

  stream.on('end', () => {
    res.end();
  });
});

// 限流中的异步队列
class AsyncRateLimiter {
  async acquire() {
    return new Promise((resolve) => {
      // 异步等待，不阻塞事件循环
      setTimeout(resolve, delayMs);
    });
  }
}
```

#### 适用场景

| 场景 | 同步方式 | 异步方式 |
|------|----------|----------|
| HTTP 请求 | 串行等待 | 并行请求 |
| 文件 I/O | 阻塞等待 | 非阻塞 |
| 数据库查询 | 串行查询 | 连接池 + 异步 |
| SSE 流式 | 难以处理 | 轻松处理 |
| WebSocket | 每连接一线程 | 单线程多连接 |

---

### Q11: SGLang vs vLLM PagedAttention

#### vLLM PagedAttention

```
传统 KV Cache 问题：
- 一次性分配大量显存（如 40GB）
- 实际使用时碎片化严重
- 资源浪费 ~60%

PagedAttention 解决方案：
- 虚拟显存分页管理
- 按需分配物理显存
- KV Cache 利用率提升 2-4 倍
```

```python
# vLLM 使用示例
from vllm import LLM, SamplingParams

llm = LLM(model="mistralai/Mistral-7B-v0.1")
params = SamplingParams(temperature=0.8, max_tokens=100)

# 自动分页管理显存
outputs = llm.generate(prompts, params)
```

#### SGLang 的优势

```
SGLang 在 vLLM 基础上优化：
1. 更低的推理延迟
   - 连续批处理 (Continuous Batching) 优化
   - 内存共享减少

2. 更好的流式输出
   - RadixAttention 树结构
   - 前缀复用减少计算

3. 更强的并行控制
   - 分布式张量并行
   - 更低的通信开销
```

```python
# SGLang 使用示例
from sglang import function as sgl_function

@sgl_function
def generate(stream):
    s, _ = stream.single("What is 1+1?")
    for i in range(5):
        s += "The answer is 2."  # 增量生成

# 流式输出，延迟更低
```

#### 对比

| 维度 | vLLM | SGLang |
|------|------|--------|
| **推理延迟** | 低 | 更低 |
| **显存利用率** | 高 (PagedAttention) | 更高 |
| **流式输出** | 好 | 更好 |
| **并行控制** | 基础 | 高级 |
| **适用场景** | 通用推理 | 复杂工作流 |
| **生态** | 更成熟 |快速发展 |

---

## 七、手撕算法

### Q12: 第 K 大元素 (LeetCode 215)

```javascript
/**
 * 方法 1: 快速选择算法 (Quick Select)
 * 平均 O(n)，最坏 O(n²)
 * 空间 O(1)
 */
function findKthLargest(nums, k) {
  return quickSelect(nums, 0, nums.length - 1, nums.length - k);
}

function quickSelect(nums, left, right, kSmallest) {
  if (left === right) return nums[left];

  const pivotIndex = partition(nums, left, right);

  if (kSmallest === pivotIndex) {
    return nums[pivotIndex];
  } else if (kSmallest < pivotIndex) {
    return quickSelect(nums, left, pivotIndex - 1, kSmallest);
  } else {
    return quickSelect(nums, pivotIndex + 1, right, kSmallest);
  }
}

function partition(nums, left, right) {
  const pivot = nums[right];
  let i = left;

  for (let j = left; j < right; j++) {
    if (nums[j] <= pivot) {
      [nums[i], nums[j]] = [nums[j], nums[i]];
      i++;
    }
  }

  [nums[i], nums[right]] = [nums[right], nums[i]];
  return i;
}

// 测试
console.log(findKthLargest([3, 2, 1, 5, 6, 4], 2)); // 5 (第2大)

// 方法 2: 堆排序 O(n log k)
function findKthLargestHeap(nums, k) {
  const minHeap = [];

  for (const num of nums) {
    minHeap.push(num);
    if (minHeap.length > k) {
      minHeap.shift();  // 移除最小值
    }
  }

  return minHeap[0];
}
```

---

## 八、综合面试题答案模板

### 面试回答结构 (STAR法则)

```
S (Situation) - 背景
"在 XX 项目中，我们遇到了..."

T (Task) - 任务
"我需要设计一个系统来..."

A (Action) - 行动
"我采用了三种方案：
  1. ...
  2. ...
  3. ..."

R (Result) - 结果
"最终将 XX 指标从 A% 提升到 B%"
```

### RAG 相关问题回答模板

```
"关于 RAG 的 XX 问题，我是这样理解的：

1. 问题本质：XX
2. 业界常见方案：XX
3. 我在项目中的实践：XX
4. 效果/指标：XX
"
```

### Agent 记忆问题回答模板

```
"Agent 的长短期记忆设计，我参考了人类记忆的层次：

1. 短期记忆：Working Memory，LLM 直接看到的
2. 中期记忆：Session Memory，滑动窗口 + 摘要
3. 长期记忆：Persistent Memory，RAG + 用户偏好

对于冲突处理，采用 Last-Write-Wins + 版本记录。
极端情绪检测通过关键词识别，干预时不打断对话流。"
```
