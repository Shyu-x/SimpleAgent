# RAG 与 Agent 面试题解

> 本文档基于联想、字节、腾讯等公司真实面试题整理

---

## 一、RAG 深入理解

### Q1: 为什么引入 BM25？向量检索和 BM25 的融合比例是怎样的？

#### 为什么需要 BM25？

| 检索方式 | 优点 | 缺点 |
|----------|------|------|
| **向量检索** | 语义理解强、相似性精准 | 可能遗漏精确关键词 |
| **BM25** | 关键词精确匹配、对专有名词敏感 | 无法理解语义 |

**BM25 原理**：
```
Score(D, Q) = Σ IDF(qi) × (tf(qi, D) × (k1 + 1)) / (tf(qi, D) + k1 × (1 - b + b × |D|/avgdl))

其中：
- tf(qi, D): 词 qi 在文档 D 中的词频
- IDF(qi): 逆文档频率
- k1, b: 调节参数（通常 k1=1.5, b=0.75）
- |D|: 文档长度
- avgdl: 平均文档长度
```

#### 融合比例

**常见融合策略**：
```javascript
// 1. 固定比例融合
const FINAL_SCORE = 0.7 * vectorScore + 0.3 * bm25Score;

// 2. RRF (Reciprocal Rank Fusion) - 更鲁棒
// RRF = Σ 1/(k + rank_i)  k通常取60
const rrfScore = (1 / (60 + vectorRank)) + (1 / (60 + bm25Rank));

// 3. CO (Complement) 融合
// 向量相似度和 BM25 互补
```

**项目中的实现** (`backend/src/domain/rag/Reranker.js`)：
```javascript
const RERANK_WEIGHTS = {
  crossEncoder: 0.4,
  bm25: 0.2,        // ← BM25 权重
  semantic: 0.3,    // ← 向量检索权重
  diversity: 0.1
};
```

**面试加分点**：
- 实际项目中需要根据效果调整比例
- 可以用 A/B 测试确定最佳比例
- RRF 是比赛/论文中常用的融合方法

---

### Q2: 检索融合的具体流程是什么？召回后有没有做 Rerank？

#### 完整检索流程

```
用户查询
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    第一阶段：多路召回                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ Vector Search│  │ BM25 Search │  │ Keyword Search│          │
│  │  (topK=20)  │  │  (topK=20)  │  │  (topK=20)  │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    第二阶段：结果融合                          │
│  - RRF 融合 或 分数加权                                      │
│  - 去重（不同召回可能返回相同文档）                            │
│  - 得到融合后的 Top 20                                       │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    第三阶段：Rerank 精排                       │
│  - CrossEncoder 精排（最准确但最慢）                           │
│  - 输入：<query, document> 对                                │
│  - 输出：精确的相关性分数                                      │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    第四阶段：截断输出                          │
│  - 返回 Top 5 ~ Top 10                                       │
│  - 过多上下文可能稀释关键信息                                  │
└─────────────────────────────────────────────────────────────┘
```

#### Rerank 详解

**为什么需要 Rerank？**

```javascript
// 第一阶段召回的问题
// 向量检索可能返回：
[
  { doc: "Python是一种编程语言", score: 0.95 },
  { doc: "Java是一种编程语言", score: 0.93 },
  { doc: "编程语言的历史发展", score: 0.90 }  // 相关但不如前两个精确
]

// Rerank 后（CrossEncoder 会考虑词项匹配）：
[
  { doc: "Python是一种编程语言", rerank_score: 0.99 },
  { doc: "Java是一种编程语言", rerank_score: 0.97 },
  { doc: "编程语言的历史发展", rerank_score: 0.75 }  // 分数下降
]
```

**CrossEncoder vs BiEncoder**：

| 方案 | 速度 | 精度 | 适用场景 |
|------|------|------|----------|
| **BiEncoder** (向量检索) | 快 | 中 | 第一阶段召回 |
| **CrossEncoder** (Rerank) | 慢 | 高 | 第二阶段精排 |

---

### Q3: Rerank 后返回几个块（Chunk）？有没有针对这个返回数量做过验证？

#### 截断策略

**返回数量选择依据**：

| 数量 | 优点 | 缺点 |
|------|------|------|
| 3-5 | LLM 上下文短、成本低 | 可能遗漏相关信息 |
| 5-10 | 平衡（推荐） | 上下文稍长 |
| 10-20 | 召回率高 | 成本高、可能稀释关键信息 |

**项目中的实现**：
```javascript
// backend/src/services/ragService.js
const RAG_CONFIG = {
  topK: 5,              // 召回 20 个，经过 Rerank 后
  rerankTopK: 5,        // 最终返回 5 个
  maxContextLength: 8000 // LLM 最大上下文
};
```

#### 验证方法

```javascript
// 1. 计算 Token 数量
function calculateTokens(docs, query) {
  const totalTokens = docs.reduce((sum, doc) => {
    return sum + countTokens(doc.content);
  }, 0) + countTokens(query);

  return totalTokens;
}

// 2. 覆盖率验证
function calculateRecall(retrievedDocs, relevantDocs) {
  const retrieved = new Set(retrievedDocs.map(d => d.id));
  const relevant = new Set(relevantDocs.map(d => d.id));
  return retrieved.size / relevant.size;  // 召回率
}

// 3. MRR (Mean Reciprocal Rank)
function calculateMRR(retrievedDocs, relevantDocs) {
  for (let i = 0; i < retrievedDocs.length; i++) {
    if (relevantDocs.includes(retrievedDocs[i].id)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}
```

---

### Q4: Rerank 后的 TopK 截断是怎么做的？

#### 截断策略

**方案一：固定截断**
```javascript
const TOP_K = 5;  // 简单直接
const results = rerankedDocs.slice(0, TOP_K);
```

**方案二：分数阈值截断**
```javascript
const SCORE_THRESHOLD = 0.7;
const results = rerankedDocs.filter(doc => doc.score >= SCORE_THRESHOLD);
// 可能有 0 个或 10 个结果
```

**方案三：动态截断**
```javascript
// 根据分数差值动态截断
function adaptiveTruncate(docs, topK = 5) {
  if (docs.length <= topK) return docs;

  const topDocScore = docs[0].score;
  const threshold = topDocScore * 0.8;  // 最高分的 80%

  const results = docs.filter(doc => doc.score >= threshold);
  return results.slice(0, topK * 2);  // 最多返回 topK*2
}
```

**面试加分点**：
- 可以讲讲用的 RRF 截断：排名倒数差距大就截断
- 可以讲讲结合 maxContextLength 来动态调整

---

### Q5: 讲一下上下文工程（Context Engineering）

#### 什么是上下文工程？

**核心思想**：如何有效地把信息塞给 LLM，让它产生更好的输出

#### Agent 的记忆（Memory）是怎么做的？

**记忆类型分层**：

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Memory Architecture                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐                                           │
│  │  Working   │ ← 当前对话的活跃上下文                       │
│  │  Memory     │   (LLM 直接看到的)                         │
│  └─────────────┘                                           │
│        ↓                                                   │
│  ┌─────────────┐                                           │
│  │ Session    │ ← 当前会话的短期记忆                         │
│  │ Memory     │   (最近 N 轮对话)                           │
│  └─────────────┘                                           │
│        ↓                                                   │
│  ┌─────────────┐                                           │
│  │ Persistent │ ← 跨会话的长期记忆                           │
│  │ Memory     │   (RAG 检索 / 摘要存储)                      │
│  └─────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**项目中的 Memory 实现**：

```javascript
// backend/src/services/MemoryWindowManager.js
class MemoryWindowManager {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 100000;      // 最大 token 数
    this.windowSize = options.windowSize || 10;        // 窗口大小（消息数）
    this.summarizeThreshold = 0.8;                      // 摘要阈值
  }

  /**
   * 管理对话历史，控制 token 数量
   */
  manageMemory(messages) {
    // 1. 估算当前 token
    const currentTokens = this.estimateTokens(messages);

    // 2. 如果超出限制，尝试摘要
    if (currentTokens > this.maxTokens * this.summarizeThreshold) {
      return this.summarizeAndCompress(messages);
    }

    // 3. 如果窗口太大，滑动窗口
    if (messages.length > this.windowSize * 2) {
      return this.slidingWindow(messages);
    }

    return messages;
  }

  /**
   * 滑动窗口：保留最近的消息
   */
  slidingWindow(messages) {
    return messages.slice(-this.windowSize);
  }

  /**
   * 摘要压缩
   */
  async summarizeAndCompress(messages) {
    const summaryPrompt = `
      请总结以下对话的要点，保留关键信息、决策和用户偏好：
      ${messages.map(m => `${m.role}: ${m.content}`).join('\n')}
    `;

    const summary = await this.llm.chat([
      { role: 'user', content: summaryPrompt }
    ]);

    return [
      { role: 'system', content: `对话摘要: ${summary}` },
      messages[messages.length - 1]  // 保留最后一条消息
    ];
  }
}
```

---

### Q6: RAG 中的幻觉问题是怎么处理的？

#### 幻觉的原因

```javascript
const HALLUCINATION_CAUSES = {
  // 1. 知识边界
  knowledgeBoundary: "模型不知道最新信息、私有知识",

  // 2. 训练偏差
  trainingBias: "某些知识训练不足，导致胡编",

  // 3. 推理错误
  reasoningError: "复杂推理过程中'走神'",

  // 4. 上下文误导
  contextMislead: "无关上下文干扰"
};
```

#### 解决方案

```javascript
// 1. 检索增强 (Retrieval Augmented)
// - 提供真实文档作为依据

// 2. 引用追溯 (Citation)
// - 让模型学会引用，格式：「根据[1]...」
// - 用户可验证，降低信任幻觉

// 3. 约束解码 (Constrained Decoding)
// - 限制输出格式，避免胡编

// 4. 不确定性估计
async function generateWithUncertainty(prompt, context) {
  const response = await llm.chat([{ role: 'user', content: prompt }]);

  // 检查回答的确定性
  const uncertainty = await estimateUncertainty(response);

  if (uncertainty > THRESHOLD) {
    return "我不确定这个问题，请参考官方文档...";
  }

  return response;
}

// 5. 后验证 (Self-Check)
async function selfCheckAnswer(question, answer, context) {
  const checkPrompt = `
    请验证以下回答是否与上下文一致：
    问题: ${question}
    回答: ${answer}
    上下文: ${context}

    如果回答与上下文不符，请指出错误。
  `;

  const checkResult = await llm.chat([{ role: 'user', content: checkPrompt }]);
  return checkResult;
}
```

**项目中的引用追溯** (`backend/src/domain/rag/CitationAssembler.js`)：
```javascript
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
```

---

## 二、Agent 相关面试题

### Q7: 你对 AI Agent 的了解

#### Agent 的定义

```
Agent = LLM + Planning + Memory + Tools

┌─────────────────────────────────────────────────────────────┐
│                        Agent                                 │
│  ┌─────────┐                                               │
│  │   LLM   │ ← 大脑，负责推理和决策                          │
│  └────┬────┘                                               │
│       ↓                                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   Planning                             ││
│  │  - ReAct (思考-行动-观察循环)                           ││
│  │  - Plan-and-Execute (计划后执行)                        ││
│  │  - Hugo (层级任务分解)                                  ││
│  └─────────────────────────────────────────────────────────┘│
│       ↓                                                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │ Memory  │  │  Tools  │  │  RAG    │                     │
│  └─────────┘  └─────────┘  └─────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

#### Agent vs 普通 LLM

| 维度 | 普通 LLM | Agent |
|------|----------|-------|
| **交互方式** | 一次性输入输出 | 多轮交互、循环执行 |
| **工具使用** | 不可 | 可调用外部工具 |
| **记忆** | 无状态 | 有状态、会记忆 |
| **自主性** | 低 | 高，可自主决策 |
| **适用场景** | 问答、写作 | 复杂任务自动化 |

---

### Q8: 你知道哪些 Agent 框架？

#### 主流框架对比

| 框架 | 开发方 | 特点 | 适用场景 |
|------|--------|------|----------|
| **LangGraph** | LangChain | 状态机、检查点 | 复杂工作流 |
| **AutoGen** | Microsoft | 多 Agent 协作 | 对话式 Agent |
| **CrewAI** | CrewAI | Role-based | 多角色协作 |
| **Dify** | 开源 | 可视化编排 | 快速搭建 |
| **Coze** | 字节 | 插件生态 | 聊天机器人 |
| **Dify** | 开源 | RAG + Agent | 企业应用 |

#### 项目中的实现

```javascript
// backend/src/services/agentEngine.js - 类似 LangGraph 的实现
class AgentEngine {
  constructor(options) {
    this.maxTurns = options.maxTurns || 50;
    this.tools = options.tools;
    this.llm = options.llm;
  }

  // ReAct 循环
  async run(userMessage) {
    const messages = [{ role: 'user', content: userMessage }];

    while (this.turn < this.maxTurns) {
      // 1. LLM 决策
      const response = await this.llm.chat(messages);

      // 2. 执行工具或返回结果
      if (response.tool_calls) {
        for (const toolCall of response.tool_calls) {
          const result = await this.executeTool(toolCall);
          messages.push({ role: 'tool', content: result });
        }
      } else {
        return response.content;
      }

      this.turn++;
    }
  }
}
```

---

### Q9: 多智能体系统设计架构？

#### 协作模式

**1. 主从模式 (Team Leader)**
```
        ┌───────────────┐
        │  Team Leader │
        │   (主 Agent)  │
        └───────┬───────┘
                │
     ┌──────────┼──────────┐
     ↓          ↓          ↓
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Agent-A │ │ Agent-B │ │ Agent-C │
│ (搜索)  │ │ (分析)  │ │ (验证)  │
└─────────┘ └─────────┘ └─────────┘
```

**2. 对等协作 (Collaborative)**
```
┌─────────┐ ←──────────→ ┌─────────┐
│ Agent-A │              │ Agent-B │
│ 擅长代码 │              │ 擅长文档 │
└─────────┘              └─────────┘
```

**3. 自主执行 (Autonomous)**
```
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Agent-A │  │ Agent-B │  │ Agent-C │
│ 独立执行 │  │ 独立执行 │  │ 独立执行 │
└─────────┘  └─────────┘  └─────────┘
       ↓            ↓            ↓
       └────────────┼────────────┘
                    ↓
            ┌───────────────┐
            │   汇总器       │
            └───────────────┘
```

#### 并行上下文隔离

```javascript
// 确保每个 Agent 读自己的上下文
class MultiAgentCoordinator {
  async executeParallel(tasks, contexts) {
    return Promise.all(
      tasks.map((task, idx) => {
        // 隔离上下文
        const isolatedContext = contexts[idx];
        return this.executeTask(task, isolatedContext);
      })
    );
  }
}
```

---

## 三、系统设计面试题

### Q10: 分布式令牌桶限流的实现

#### 令牌桶原理

```
       ┌─────────────────┐
       │     令牌桶       │
       │  ┌───────────┐  │
  ──→  │  │ 令牌: ●●● │  │  ──→  请求通过
  添加  │  │      ●●● │  │
  速率  │  └───────────┘  │
       └─────────────────┘

规则：
- 桶容量: MAX_TOKENS
- 添加速率: R tokens/秒
- 每次请求消耗 1 个令牌
```

#### 分布式实现

```javascript
// Redis + Lua 实现
const luaScript = `
local key = KEYS[1]
local rate = tonumber(ARGV[1])      -- 每秒补充令牌数
local capacity = tonumber(ARGV[2])   -- 桶容量
local now = tonumber(ARGV[3])        -- 当前时间戳
local requested = tonumber(ARGV[4])  -- 请求的令牌数

-- 获取上次的桶状态
local data = redis.call('HMGET', key, 'tokens', 'lastTime')
local tokens = tonumber(data[1]) or capacity
local lastTime = tonumber(data[2]) or now

-- 计算应该补充的令牌数
local elapsed = now - lastTime
local added = elapsed * rate
tokens = math.min(capacity, tokens + added)

-- 检查是否可以执行
local allowed = 0
if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
end

-- 更新状态
redis.call('HMSET', key, 'tokens', tokens, 'lastTime', now)
redis.call('EXPIRE', key, 60)

return allowed
`;

// 执行
const result = await redis.eval(luaScript, 1, 'rate_limit:user:123',
  10,  // 每秒10个令牌
  100, // 容量100
  Date.now(),
  1    // 请求1个令牌
);
```

---

### Q11: 漏桶算法（Leaky Bucket）原理

#### 原理图

```
        ┌─────────────────┐
        │      漏桶        │
  ──→   │  ┌───────────┐  │
  请求   │  │ 请求●●●●● │  │  ──→  恒定速率输出
  输入   │  │      ●●●● │  │
        │  └───────────┘  │
        └─────────────────┘

特点：
- 队列长度固定（超出则拒绝）
- 输出速率恒定
- 平滑请求峰值
```

#### 实现

```javascript
class LeakyBucket {
  constructor(rate, capacity) {
    this.rate = rate;        // 漏出速率 (个/秒)
    this.capacity = capacity; // 桶容量
    this.queue = [];          // 请求队列
    this.lastLeakTime = Date.now();
  }

  async tryAdd(request) {
    const now = Date.now();

    // 1. 漏出旧请求
    this.leak(now);

    // 2. 检查是否满
    if (this.queue.length >= this.capacity) {
      return false;  // 拒绝
    }

    // 3. 加入桶
    this.queue.push({ request, arrivalTime: now });
    return true;
  }

  leak(now) {
    const elapsed = (now - this.lastLeakTime) / 1000;
    const toLeak = Math.floor(elapsed * this.rate);

    for (let i = 0; i < toLeak && this.queue.length > 0; i++) {
      this.queue.shift();  // 移除最旧的
    }

    this.lastLeakTime = now;
  }
}
```

---

### Q12: 滑动窗口算法限流

#### 原理

```
时间轴 ─────────────────────────────────────────────────→

窗口 [──────────────────────────] 1分钟
  ┌──┬──┬──┬──┬──┬──┬──┬──┐
  │10│25│30│15│20│  │  │  │  ← 每秒请求数
  └──┴──┴──┴──┴──┴──┴──┴──┘

窗口滑动，每秒移动一次
```

#### Redis 实现

```javascript
// Redis Sorted Set 实现滑动窗口
async function slidingWindowRateLimit(key, limit, windowSize) {
  const now = Date.now();
  const windowMs = windowSize * 1000;

  const redis = await getRedis();

  // 1. 移除窗口外的旧数据
  await redis.zremrangebyscore(key, 0, now - windowMs);

  // 2. 统计当前窗口请求数
  const count = await redis.zcard(key);

  // 3. 检查是否超限
  if (count >= limit) {
    return { allowed: false, remaining: 0, resetMs: windowMs };
  }

  // 4. 添加当前请求
  await redis.zadd(key, now, `${now}-${Math.random()}`);

  // 5. 设置过期
  await redis.expire(key, windowSize);

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetMs: windowMs
  };
}

// 使用
const result = await slidingWindowRateLimit('rate:user:123', 100, 60);
```

#### 滑动窗口结构体

```javascript
// 滑动窗口包含的字段
const SlidingWindow = {
  timestamps: [t1, t2, t3, ...],  // 请求时间戳数组
  windowSize: 60000,              // 窗口大小（毫秒）
  limit: 100,                     // 限制数量
  currentIndex: 0,                // 当前索引（环形缓冲区优化）
};
```

#### 令牌桶 vs 滑动窗口

| 维度 | 令牌桶 | 滑动窗口 |
|------|--------|----------|
| **精度** | 精确 | 精确 |
| **实现** | 简单 | 稍复杂 |
| **突发流量** | 允许（桶里有令牌） | 不允许 |
| **平滑输出** | 允许 | 不允许 |
| **Redis 友好** | Lua 脚本 | Sorted Set |

**滑动窗口的缺点**：
- 实现更复杂
- 不适合突发流量场景
- 内存占用比令牌桶高

---

## 四、缓存与数据结构面试题

### Q13: LRU 缓存的实现原理

#### 原理

```
LRU = Least Recently Used (最近最少使用)

┌─────────────────────────────────────┐
│              LRU Cache              │
├─────────────────────────────────────┤
│  GET(key) → 移到链表头部             │
│  PUT(key) → 新增到头部               │
│  超出容量 → 移除尾部节点              │
└─────────────────────────────────────┘

数据结构：HashMap + 双向链表
- HashMap: O(1) 查找
- 双向链表: O(1) 移动和删除
```

#### 实现

```javascript
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();  // Map 保持插入顺序，模拟链表
  }

  get(key) {
    if (!this.cache.has(key)) return -1;

    // 移到末尾（最近使用）
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // 移除最旧的（Map 的第一个）
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }

    this.cache.set(key, value);
  }
}

// 双向链表实现（更标准）
class LRUNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

class LRUCacheLinkedList {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
    // 虚拟头尾节点
    this.head = new LRUNode(null, null);
    this.tail = new LRUNode(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key) {
    if (!this.map.has(key)) return -1;

    const node = this.map.get(key);
    this.moveToHead(node);
    return node.value;
  }

  put(key, value) {
    if (this.map.has(key)) {
      const node = this.map.get(key);
      node.value = value;
      this.moveToHead(node);
    } else {
      const node = new LRUNode(key, value);
      this.map.set(key, node);
      this.addToHead(node);

      if (this.map.size > this.capacity) {
        const removed = this.removeTail();
        this.map.delete(removed.key);
      }
    }
  }

  moveToHead(node) {
    this.removeNode(node);
    this.addToHead(node);
  }

  removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  addToHead(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  removeTail() {
    const node = this.tail.prev;
    this.removeNode(node);
    return node;
  }
}
```

---

### Q14: 布隆过滤器（Bloom Filter）

#### 原理

```
┌─────────────────────────────────────────────────────────────┐
│                    Bloom Filter                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  添加 "apple":                                              │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┐                       │
│  │  0  │  1  │  0  │  1  │  0  │  0  │  ← 位数组            │
│  └─────┴─────┴─────┴─────┴─────┴─────┘                       │
│         ↑           ↑                                       │
│       hash1()    hash2()                                    │
│                                                              │
│  查询 "apple":                                               │
│  - hash1("apple") → 位置 1? 是 → 继续                        │
│  - hash2("apple") → 位置 3? 是 → 可能存在 ✓                   │
│                                                              │
│  查询 "banana":                                              │
│  - hash1("banana") → 位置 1? 是 → 继续                       │
│  - hash2("banana") → 位置 4? 否 → 一定不存在 ✗               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 实现

```javascript
class BloomFilter {
  constructor(size, hashCount) {
    this.size = size;           // 位数组大小
    this.hashCount = hashCount; // 哈希函数个数
    this.bitArray = new Array(size).fill(0);
  }

  // 多个哈希函数
  hash(value) {
    const results = [];
    for (let i = 0; i < this.hashCount; i++) {
      // 简单的哈希组合
      const hash = this.simpleHash(value + i);
      results.push(hash % this.size);
    }
    return results;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) % this.size;
    }
    return Math.abs(hash);
  }

  add(value) {
    const indexes = this.hash(value);
    for (const idx of indexes) {
      this.bitArray[idx] = 1;
    }
  }

  contains(value) {
    const indexes = this.hash(value);
    for (const idx of indexes) {
      if (this.bitArray[idx] === 0) {
        return false;  // 一定不存在
      }
    }
    return true;  // 可能存在（可能有误判）
  }
}

// 使用
const bloom = new BloomFilter(1000000, 7);
bloom.add("apple");
console.log(bloom.contains("apple"));  // true
console.log(bloom.contains("banana")); // false
```

#### 适用场景

| 场景 | 说明 |
|------|------|
| **Redis 缓存穿透** | 先检查 Bloom Filter，不存在直接返回 |
| **URL 去重** | 爬虫中避免重复 URL |
| **拼音纠错** | 检查词是否存在 |
| **邮箱验证** | 验证邮箱是否在黑名单 |

---

## 五、数据库面试题

### Q15: MySQL 索引失效的情况

```javascript
const INDEX_FAIL_CASES = [
  // 1. 类型转换
  "SELECT * FROM users WHERE age = '18'",  // age 是 INT，字符串索引失效

  // 2. 函数/运算
  "SELECT * FROM users WHERE YEAR(birthday) = 2000",  // 函数导致索引失效
  "SELECT * FROM users WHERE age + 1 = 20",          // 运算导致索引失效

  // 3. LIKE 开头通配符
  "SELECT * FROM users WHERE name LIKE '%张三'",       // 前缀通配符失效

  // 4. OR 条件
  "SELECT * FROM users WHERE name = '张三' OR age = 18", // 部分索引失效

  // 5. IS NULL / IS NOT NULL
  // 某些情况下索引失效

  // 6. NOT IN / NOT EXISTS
  // 可能导致全表扫描

  // 7. 统计信息不准确
  // ANALYZE TABLE 更新统计信息
];
```

---

### Q16: MVCC 和 ReadView

#### MVCC 原理

```
┌─────────────────────────────────────────────────────────────┐
│                        MVCC                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  每一行数据有两个隐藏列：                                      │
│  - DB_TRX_ID: 最近修改的事务 ID                               │
│  - DB_ROLL_PTR: 指向 undo log 的指针                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ id | name | age | DB_TRX_ID | DB_ROLL_PTR           │    │
│  │ 1  | 张三  | 20  | 100       | NULL                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ReadView 包含：                                              │
│  - m_ids: 活跃事务列表                                        │
│  - min_trx_id: 最小活跃事务 ID                               │
│  - max_trx_id: 创建 ReadView 时的最大事务 ID                  │
│  - creator_trx_id: 创建该 ReadView 的事务 ID                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 不同隔离级别的 ReadView

| 隔离级别 | 读取内容 | ReadView |
|----------|----------|----------|
| **READ UNCOMMITTED** | 最新版本 | 每次都读最新 |
| **READ COMMITTED** | 已提交 | 每次 SELECT 都生成新 ReadView |
| **REPEATABLE READ** | 已提交 | 第一次 SELECT 生成，整个事务复用 |
| **SERIALIZABLE** | 锁 | 强制加锁，无 MVCC |

```javascript
// 隔离级别实现差异
const ISOLATION_LEVELS = {
  READ_COMMITTED: {
    readViewCreate: '每次SELECT',
    consistentRead: false
  },
  REPEATABLE_READ: {
    readViewCreate: '第一次SELECT',
    consistentRead: true  // 事务内多次读取结果相同
  }
};
```

---

## 六、手撕代码

### Q17: LeetCode 768 - 最多能完成排序的块 II

```javascript
/**
 * LeetCode 768: 最多能完成排序的块 II
 *
 * 问题：arr = [5,4,3,2,1,6]
 * 找出最多能切成几个块，使每块排序后整个数组有序
 *
 * 思路：记录当前块的最大值，如果最大值等于已处理的元素数，则可分割
 */
function maxChunksToSorted(arr) {
  const n = arr.length;
  let chunks = 0;
  let maxSoFar = 0;

  for (let i = 0; i < n; i++) {
    maxSoFar = Math.max(maxSoFar, arr[i]);

    // 如果当前最大值等于已处理的元素数，可以分割
    if (maxSoFar === i) {
      chunks++;
    }
  }

  return chunks;
}

// 测试
console.log(maxChunksToSorted([5, 4, 3, 2, 1, 6])); // 2 ([5,4,3,2,1] [6])
console.log(maxChunksToSorted([2, 1, 3, 4, 4]));     // 4 ([2] [1] [3] [4,4])
```

---

## 七、面试技巧

### 1. 回答问题结构化

```
STAR 法则：
- S (Situation): 背景/场景
- T (Task): 任务/挑战
- A (Action): 具体行动
- R (Result): 结果/影响

示例：
在 XX 项目中（S），需要实现 RAG 检索优化（T），
我通过引入 BM25 + 向量检索混合方案（A），
最终将召回率从 70% 提升到 92%（R）
```

### 2. 深入追问

```
面试官问：Rerank 是怎么做的？

加分回答：
- 先讲基本流程
- 再讲项目中如何配置权重
- 再讲调优过程
- 最后可以说说 RRF 等其他融合方法
- 适当提问：这个场景下有没有考虑过 XXX 方法？
```

### 3. 展示思考过程

```
面试官问：如果返回的 chunk 数量过多怎么办？

思考：
1. 先确认问题 - 上下文长度限制？
2. 分析原因 - 过多 chunk 可能稀释关键信息
3. 解决方案 - 动态截断、分数阈值、重排序
4. 权衡 - 召回率 vs 精确度
5. 实际经验 - 项目中怎么做的，效果如何
```
