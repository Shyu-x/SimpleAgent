# Ollama 向量模型配置指南

> 适用场景：使用本地开源向量模型处理知识库切片
> 硬件要求：NVIDIA RTX 4060 (8GB 显存)

---

## 一、架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Chat 应用                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────┐ │
│  │   前端 UI    │────▶│   后端 API   │────▶│  PostgreSQL │ │
│  │  (Next.js)  │     │  (Node.js)   │     │  + pgvector │ │
│  └──────────────┘     └───────┬──────┘     └────────────┘ │
│                               │                             │
│                               ▼                             │
│                        ┌──────────────┐                    │
│                        │    Ollama    │                    │
│                        │  (本地 GPU)  │                    │
│                        └──────────────┘                    │
│                              │                             │
│                        ┌──────────────┐                    │
│                        │  向量模型    │                    │
│                        │ mxbai-embed │                    │
│                        └──────────────┘                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、快速开始

### 2.1 环境要求

- NVIDIA RTX 4060 (8GB)
- Docker Desktop (with GPU support)
- CUDA Driver 12.0+

### 2.2 启动服务

```bash
# 1. 启动所有服务（包括 Ollama）
docker-compose up -d postgres redis ollama

# 2. 拉取向量模型（首次运行）
docker exec -it aichat-ollama ollama pull mxbai-embed-large

# 3. 验证模型
curl http://localhost:11434/api/tags
```

### 2.3 验证配置

```bash
# 测试 Ollama 健康
curl http://localhost:11434/api/tags

# 测试向量嵌入
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "mxbai-embed-large", "prompt": "测试文本"}'
```

---

## 三、推荐模型（4060 级别）

| 模型 | 维度 | 显存占用 | 说明 |
|------|------|----------|------|
| **mxbai-embed-large** | 1024 | ~4GB | **推荐**，高性能平衡 |
| nomic-embed-text | 768 | ~2GB | 备选，稍低维度 |
| all-minilm | 384 | ~1GB | 最低配置，极轻量 |

### 模型选择建议

- **知识库检索**: `mxbai-embed-large` (推荐)
- **代码检索**: `nomic-embed-text` (更细粒度)
- **资源受限**: `all-minilm` (极轻量)

---

## 四、环境变量配置

在 `backend/.env` 中添加：

```bash
# Ollama 配置
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large

# 向量维度（与模型匹配）
EMBEDDING_DIMENSION=1024

# 数据库（已有 pgvector）
DATABASE_URL=postgresql://chat:chat123@localhost:54320/aichat
```

---

## 五、Docker 服务详情

### 5.1 Ollama 容器

```yaml
ollama:
  image: ollama/ollama:latest
  ports:
    - "11434:11434"
  volumes:
    - ollama_data:/root/.ollama
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

### 5.2 访问 Ollama API

```javascript
// 直接调用 Ollama
const response = await fetch('http://localhost:11434/api/embeddings', {
  method: 'POST',
  body: JSON.stringify({
    model: 'mxbai-embed-large',
    prompt: '要嵌入的文本'
  })
});
```

### 5.3 GPU 资源配置

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all  # 使用所有可用 GPU
          capabilities: [gpu]
```

---

## 六、常见问题

### Q1: Ollama 容器无法访问 GPU

```bash
# 检查 NVIDIA Driver
nvidia-smi

# 检查 Docker GPU 支持
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### Q2: 模型拉取失败

```bash
# 手动拉取
docker exec -it aichat-ollama ollama pull mxbai-embed-large

# 查看日志
docker logs aichat-ollama
```

### Q3: 嵌入速度慢

- 降低批次大小：`BATCH_SIZE=8`
- 使用较轻量模型：`OLLAMA_EMBEDDING_MODEL=all-minilm`

### Q4: 显存不足 (OOM)

```bash
# 清理 Ollama 模型缓存
docker exec -it aichat-ollama ollama stop mxbai-embed-large
docker exec -it aichat-ollama ollama rm mxbai-embed-large

# 或使用更小模型
OLLAMA_EMBEDDING_MODEL=all-minilm
```

---

## 七、生产环境建议

### 7.1 独立部署

```yaml
# 生产环境推荐配置
services:
  ollama:
    cpus: 4
    mem_limit: 8g
    environment:
      OLLAMA_KEEP_ALIVE: 24h
```

### 7.2 监控

```bash
# 查看 GPU 使用
watch -n 1 nvidia-smi

# 查看 Ollama 状态
curl http://localhost:11434/api/ps
```

### 7.3 备选方案（无 GPU）

如果无 GPU，可以配置使用 OpenAI 向量服务：

```bash
OPENAI_API_KEY=sk-xxx
EMBEDDING_PROVIDER=openai  # 而非 ollama
```

---

## 八、API 集成

### 8.1 后端服务类

```javascript
const { OllamaEmbeddingService } = require('./services/OllamaEmbeddingService');

const embeddingService = new OllamaEmbeddingService({
  baseUrl: 'http://localhost:11434',
  model: 'mxbai-embed-large',
  dimension: 1024
});

// 生成嵌入
const result = await embeddingService.embed('要嵌入的文本');

// 批量嵌入
const batchResult = await embeddingService.embedBatch([
  '文本1',
  '文本2',
  '文本3'
]);
```

### 8.2 知识库分块嵌入

```javascript
const docText = '很长的文档内容...';

// 自动分块并嵌入
const result = await embeddingService.embedDocument(docText, {
  chunkSize: 512,
  overlap: 50
});

console.log(result.chunks); // 包含每个块的嵌入向量
```

---

## 九、相关文件

| 文件 | 说明 |
|------|------|
| `backend/src/services/OllamaEmbeddingService.js` | 向量嵌入服务 |
| `backend/src/services/ollamaService.js` | Ollama API 封装 |
| `backend/src/services/pgVectorStore.js` | 向量存储 (pgvector) |
| `docker-compose.yml` | Docker 服务配置 |

---

**更新日期**: 2026-03-21
