/**
 * Ollama 向量嵌入服务
 * 使用 Ollama 运行开源向量模型进行文本嵌入
 *
 * 适用模型（4060 级别显卡）：
 * - mxbai-embed-large (1024维，轻量高性能)
 * - nomic-embed-text (768维)
 * - all-minilm (384维，极轻量)
 */

class OllamaEmbeddingService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = options.model || process.env.OLLAMA_EMBEDDING_MODEL || 'mxbai-embed-large';
    this.dimension = options.dimension || 1024;
    this.timeout = options.timeout || 60000;
    this.batchSize = options.batchSize || 32; // 每批处理的文本数
  }

  /**
   * 获取服务信息
   */
  async getInfo() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);

      const data = await response.json();
      return {
        success: true,
        models: data.models || [],
        loadedModel: this.model
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 检查模型是否已加载
   */
  async isModelLoaded() {
    try {
      const response = await fetch(`${this.baseUrl}/api/ps`);
      if (!response.ok) return false;

      const data = await response.json();
      return data.models?.some(m => m.name === this.model) || false;
    } catch {
      return false;
    }
  }

  /**
   * 确保模型已加载
   */
  async ensureModelLoaded() {
    const loaded = await this.isModelLoaded();
    if (loaded) return true;

    try {
      // 触发模型加载（通过生成请求）
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: 'initialization'
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Failed to load model: ${response.status}`);
      }

      return true;
    } catch (error) {
      throw new Error(`Model loading failed: ${error.message}`);
    }
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async embed(text) {
    if (!text || text.trim().length === 0) {
      return null;
    }

    try {
      await this.ensureModelLoaded();

      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        embedding: data.embedding,
        model: this.model,
        dimension: data.embedding.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts) {
    if (!texts || texts.length === 0) {
      return { success: true, embeddings: [] };
    }

    const results = [];

    // 分批处理
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.embed(text))
      );
      results.push(...batchResults);

      // 批次间延迟，避免过快
      if (i + this.batchSize < texts.length) {
        await this.sleep(100);
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
      success: failed.length === 0,
      embeddings: results.map((r, i) => ({
        index: i,
        text: texts[i],
        embedding: r.success ? r.embedding : null,
        error: r.error
      })),
      stats: {
        total: texts.length,
        successful: successful.length,
        failed: failed.length
      }
    };
  }

  /**
   * 为知识库文档生成嵌入
   */
  async embedDocument(document, chunkSize = 512, overlap = 50) {
    // 简单分块（按字符）
    const chunks = this.splitText(document, chunkSize, overlap);

    // 批量嵌入
    const result = await this.embedBatch(chunks);

    return {
      success: result.success,
      chunks: chunks.map((chunk, i) => ({
        content: chunk,
        index: i,
        embedding: result.embeddings[i]?.embedding,
        error: result.embeddings[i]?.error
      })),
      stats: {
        totalChunks: chunks.length,
        successfulEmbeddings: result.embeddings.filter(e => e.embedding).length
      }
    };
  }

  /**
   * 文本分块
   */
  splitText(text, chunkSize, overlap) {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;

      // 尝试在句子边界分块
      if (end < text.length) {
        const sentenceEnd = text.lastIndexOf(/[.!?。！？]\s/.source, end);
        const newlineEnd = text.lastIndexOf('\n', end);

        if (sentenceEnd > start + chunkSize / 2) {
          end = sentenceEnd + 1;
        } else if (newlineEnd > start + chunkSize / 2) {
          end = newlineEnd + 1;
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end - overlap;

      if (start >= text.length - chunkSize) {
        // 最后一小块
        const lastChunk = text.slice(start).trim();
        if (lastChunk.length > overlap) {
          chunks.push(lastChunk);
        }
        break;
      }
    }

    return chunks;
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

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

  /**
   * 查找最相似的文本
   */
  async findMostSimilar(queryEmbedding, candidates) {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    let bestMatch = null;
    let bestSimilarity = -1;

    for (const candidate of candidates) {
      if (!candidate.embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, candidate.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = { ...candidate, similarity };
      }
    }

    return bestMatch;
  }

  /**
   * 清理模型（释放显存）
   */
  async unloadModel() {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          keep_alive: 0
        })
      });

      return { success: response.ok };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 推荐模型配置（4060 8GB 显存）
const RECOMMENDED_MODELS = {
  'mxbai-embed-large': {
    dimension: 1024,
    description: '推荐 - 高性能平衡，4060 可流畅运行',
    vram: '~4GB'
  },
  'nomic-embed-text': {
    dimension: 768,
    description: '替代选择 - 稍低维度',
    vram: '~2GB'
  },
  'all-minilm': {
    dimension: 384,
    description: '最低配置 - 极轻量，适合保守设置',
    vram: '~1GB'
  }
};

module.exports = {
  OllamaEmbeddingService,
  RECOMMENDED_MODELS
};
