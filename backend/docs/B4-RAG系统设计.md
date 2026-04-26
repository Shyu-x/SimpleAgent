# RAG系统设计 - 如何减少 Agent 幻觉

## 核心问题
RAG（检索增强生成）如何帮助 Agent 减少幻觉？为什么要这样设计？

## 什么是幻觉？

### 幻觉的定义
LLM 生成的内容听起来合理，但实际上是**错误的**或**不存在**的

### 幻觉的例子
```
用户: "《三体》的作者是谁？"

LLM 回复: "《三体》的作者是刘慈欣。"  ✓ 正确

vs

LLM 回复: "《三体》的作者是王晋康。"  ✗ 幻觉（听起来合理但错误）
```

### 幻觉的原因
1. **知识截止日期**：模型不知道最新信息
2. **训练数据偏差**：某些知识训练不足
3. **推理过程中的错误**：模型"编造"答案
4. **缺乏具体上下文**：不知道用户具体指什么

## RAG 如何减少幻觉

### 核心思想
```
不依赖模型记忆 → 从外部知识库检索 → 结合上下文回答
```

### RAG 工作流程
```
用户问题
    ↓
┌─────────────────────────────────────────────────────────┐
│  Query Processing (问题处理)                             │
│  - 改写 (Rewrite): 补全省略信息                          │
│  - 拆分 (Decompose): 分解复杂问题                        │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│  Retrieval (检索)                                        │
│  - 向量检索 (Vector Search)                             │
│  - 关键词检索 (Keyword Search)                           │
│  - 混合检索 (Hybrid Search)                              │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│  Rerank (重排序)                                         │
│  - CrossEncoder 精排                                     │
│  - BM25 排序                                             │
│  - 多策略融合                                            │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│  Generation (生成)                                       │
│  - 组装上下文                                            │
│  - 引用追溯                                              │
│  - 基于事实的回答                                         │
└─────────────────────────────────────────────────────────┘
```

## 项目中的 RAG 实现

### 文件位置
```
backend/src/
├── domain/rag/
│   ├── QueryRewriteService.js   # 问题改写
│   ├── QueryDecomposeService.js # 问题拆分
│   ├── IntentClassifier.js      # 意图分类
│   ├── Reranker.js              # 重排序
│   └── CitationAssembler.js      # 引用组装
└── services/ragService.js       # RAG 服务编排
```

### 1. 问题改写 (Query Rewrite)

**为什么需要？**
```
用户: "它的作者是谁？" (指代不明)
模型不知道"它"指什么

改写后: "《三体》小说的作者是谁？"
```

**代码实现** (`domain/rag/QueryRewriteService.js`)
```javascript
class QueryRewriteService {
  constructor() {
    this.contextWindow = 5;  // 参考的历史消息数
  }

  /**
   * 改写问题，补全上下文
   * @param {string} query - 用户问题
   * @param {Array} history - 对话历史
   */
  rewrite(query, history = []) {
    // 1. 代词消解（简化版）
    let rewritten = this.resolvePronouns(query, history);

    // 2. 省略信息补全
    rewritten = this.expandAbbreviations(rewritten);

    // 3. 语法规范化
    rewritten = this.normalize(rewritten);

    return rewritten;
  }

  /**
   * 代词消解
   */
  resolvePronouns(query, history) {
    const pronouns = ['它', '他', '她', '这个', '那个', '这个', '哪个'];

    for (const pronoun of pronouns) {
      if (query.includes(pronoun) && history.length > 0) {
        // 找到最后一个提到的实体
        const lastEntity = this.findLastEntity(history);
        if (lastEntity) {
          return query.replace(pronoun, lastEntity);
        }
      }
    }

    return query;
  }
}
```

### 2. 问题拆分 (Query Decompose)

**为什么需要？**
```
用户: "《三体》和《基地》的作者都是谁？分别出生于哪年？"

拆分为:
- Q1: 《三体》的作者是谁？出生于哪年？
- Q2: 《基地》的作者是谁？出生于哪年？
```

**代码实现** (`domain/rag/QueryDecomposeService.js`)
```javascript
class QueryDecomposeService {
  /**
   * 拆分复杂问题
   * @param {string} query - 复杂问题
   * @returns {Array} 子问题列表
   */
  decompose(query) {
    // 1. 并列结构检测
    const parallelMarkers = ['和', '与', '还是', '分别', '各自'];

    for (const marker of parallelMarkers) {
      if (query.includes(marker)) {
        return this.splitByParallel(query, marker);
      }
    }

    // 2. 条件检测
    if (query.includes('如果') || query.includes('当')) {
      return [query];  // 暂不处理复杂条件
    }

    // 3. 简单问题不拆分
    return [query];
  }

  splitByParallel(query, marker) {
    const parts = query.split(marker);
    const subQueries = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();

      // 保留完整的上下文
      let subQuery = part;

      // 检查是否有共同的问题主体
      const commonSubject = this.extractCommonSubject(parts);
      if (!part.includes(commonSubject) && commonSubject) {
        subQuery = `${commonSubject}${marker}${part}`;
      }

      subQueries.push(subQuery);
    }

    return subQueries;
  }
}
```

### 3. 意图分类 (Intent Classifier)

**为什么需要？**
```
用户: "今天天气怎么样？"
意图: tool_call → 调用 weather 工具

用户: "什么是量子计算？"
意图: knowledge → RAG 检索

用户: "你好"
意图: chat → 直接回复
```

**代码实现** (`domain/rag/IntentClassifier.js`)
```javascript
class IntentClassifier {
  constructor() {
    // 意图类型定义
    this.intents = {
      tool_call: {
        keywords: ['天气', '计算', '搜索', '查询', '帮我'],
        description: '需要执行工具'
      },
      knowledge: {
        keywords: ['什么是', '解释', '原理', '为什么', '哪个'],
        description: '知识问答'
      },
      rag: {
        keywords: ['关于', '介绍一下', '说说'],
        description: '需要检索知识'
      },
      chat: {
        keywords: ['你好', '嗨', '在吗'],
        description: '闲聊'
      }
    };
  }

  /**
   * 分类用户意图
   */
  classify(query) {
    // 1. 关键词匹配
    for (const [intent, config] of Object.entries(this.intents)) {
      for (const keyword of config.keywords) {
        if (query.includes(keyword)) {
          return {
            intent,
            confidence: 0.9,
            reason: `matched keyword: ${keyword}`
          };
        }
      }
    }

    // 2. 默认分类
    return {
      intent: 'chat',
      confidence: 0.5,
      reason: 'default'
    };
  }
}
```

### 4. 多路检索 (Multi-Channel Retrieval)

**为什么需要？**
```
单一检索的局限：
- 向量检索：擅长语义相似，但可能遗漏关键词
- 关键词检索：精确匹配，但不理解语义

混合检索 = 两者结合 = 更高召回率
```

**代码实现** (`services/ragService.js`)
```javascript
class RAGService {
  constructor() {
    this.vectorStore = new VectorStore();
    this.keywordStore = new KeywordStore();
  }

  /**
   * 多路检索
   */
  async retrieve(query, options = {}) {
    const { topK = 5 } = options;

    // 1. 并行执行多种检索
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorStore.search(query, topK * 2),
      this.keywordStore.search(query, topK * 2)
    ]);

    // 2. 结果合并
    const mergedResults = this.mergeResults(vectorResults, keywordResults);

    // 3. 重排序
    const reranked = await this.reranker.rerank(query, mergedResults);

    // 4. 返回 TopK
    return reranked.slice(0, topK);
  }

  mergeResults(vectorResults, keywordResults) {
    const docMap = new Map();

    // 添加向量检索结果
    for (const doc of vectorResults) {
      doc.source = 'vector';
      doc.vectorScore = doc.score;
      docMap.set(doc.id, doc);
    }

    // 合并关键词检索结果
    for (const doc of keywordResults) {
      if (docMap.has(doc.id)) {
        docMap.get(doc.id).keywordScore = doc.score;
      } else {
        doc.source = 'keyword';
        doc.keywordScore = doc.score;
        docMap.set(doc.id, doc);
      }
    }

    return Array.from(docMap.values());
  }
}
```

### 5. 重排序 (Reranker)

**为什么需要？**
```
检索返回 20 个结果，可能只有 3-5 个真正相关
Reranker 精排，提高 topK 的质量
```

**多策略融合** (`domain/rag/Reranker.js`)
```javascript
class Reranker {
  constructor() {
    this.strategies = {
      crossEncoder: new CrossEncoderStrategy(),  // 最准确但最慢
      bm25: new BM25Strategy(),                  // 关键词权重
      semantic: new SemanticStrategy(),           // 语义相似度
      diversity: new DiversityStrategy()         // 多样性
    };

    this.defaultWeights = {
      crossEncoder: 0.4,
      bm25: 0.2,
      semantic: 0.3,
      diversity: 0.1
    };
  }

  /**
   * 多策略重排序
   */
  rerank(query, documents, weights = this.defaultWeights) {
    // 1. 各策略独立评分
    const scores = {};
    for (const [name, strategy] of Object.entries(this.strategies)) {
      scores[name] = strategy.score(query, documents);
    }

    // 2. 加权融合
    const finalScores = documents.map((doc, idx) => {
      let totalScore = 0;
      for (const [name, weight] of Object.entries(weights)) {
        totalScore += weight * scores[name][idx];
      }
      return { doc, score: totalScore };
    });

    // 3. 排序
    return finalScores
      .sort((a, b) => b.score - a.score)
      .map(item => ({
        ...item.doc,
        finalScore: item.score
      }));
  }
}
```

### 6. 引用追溯 (Citation Assembler)

**为什么需要？**
```
用户问: "《三体》作者是谁？"

无引用回答: "作者是刘慈欣。" ← 不知道来源

有引用回答: "作者是刘慈欣 [1]。" ← 可追溯
  [1] 《三体》词条，维基百科
```

**代码实现** (`domain/rag/CitationAssembler.js`)
```javascript
class CitationAssembler {
  /**
   * 组装引用
   */
  assemble(query, answer, retrievedDocs) {
    const citations = retrievedDocs.map((doc, idx) => ({
      id: `[${idx + 1}]`,
      source: doc.source,
      content: doc.content,
      url: doc.url
    }));

    return {
      answer: this.insertCitations(answer, citations),
      citations,
      hasCitations: citations.length > 0
    };
  }

  insertCitations(answer, citations) {
    // 简化版：在答案末尾添加引用
    const citationText = citations
      .map(c => `${c.id} ${c.source}`)
      .join(', ');

    return citations.length > 0
      ? `${answer}\n\n参考: ${citationText}`
      : answer;
  }
}
```

## RAG 减少幻觉的原理

### 对比
| 方案 | 幻觉率 | 实时性 | 成本 |
|------|--------|--------|------|
| 纯 LLM | 高 | 依赖训练数据 | 低 |
| RAG | 低 | 高（实时检索） | 中 |
| Fine-tuning | 中 | 中 | 高 |

### RAG 减少幻觉的关键
1. **提供事实基础**：检索到的文档作为证据
2. **限制生成范围**：让 LLM "看"着文档回答
3. **引用追溯**：用户可验证，降低信任幻觉
4. **最新知识**：实时检索，不依赖训练数据

## 新手常见问题

Q: RAG 一定会减少幻觉吗？
A: 不一定，如果检索质量差或文档本身错误，仍可能幻觉

Q: 什么时候不用 RAG？
A: 闲聊、创意写作、通用知识等不需要精确事实的场景

Q: 如何评估 RAG 效果？
A: 使用 RAGAS、Trulens 等框架评估检索和生成质量

## 延伸学习
- 项目 RAG 源码：`backend/src/domain/rag/` 和 `backend/src/services/ragService.js`
- RAG 最佳实践：https://docs.langchain.com/docs/use-cases/question-answering
- Reranker 模型：https://www.sbert.net/examples/applications/retrieve_rerank/
