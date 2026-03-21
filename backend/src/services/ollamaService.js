/**
 * Ollama 服务管理
 * 提供 Ollama 模型管理和健康检查
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

/**
 * 拉取模型
 */
async function pullModel(modelName, onProgress) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(30 * 60 * 1000) // 30分钟超时
    });

    if (!response.ok) {
      throw new Error(`Pull failed: ${response.status}`);
    }

    // 流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (onProgress) {
            onProgress(data);
          }
          if (data.status === 'success') {
            return { success: true, model: modelName };
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    return { success: true, model: modelName };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 列出已安装的模型
 */
async function listModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    return {
      success: true,
      models: data.models || []
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 获取模型信息
 */
async function getModelInfo(modelName) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    return { success: true, info: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 健康检查
 */
async function healthCheck() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });

    return {
      success: response.ok,
      status: response.ok ? 'healthy' : 'unhealthy'
    };
  } catch (error) {
    return {
      success: false,
      status: 'unreachable',
      error: error.message
    };
  }
}

/**
 * 生成文本（测试用）
 */
async function generate(prompt, model = 'llama3.2') {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    return { success: true, response: data.response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 嵌入向量
 */
async function embed(text, model = 'mxbai-embed-large') {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    return { success: true, embedding: data.embedding };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  pullModel,
  listModels,
  getModelInfo,
  healthCheck,
  generate,
  embed,
  OLLAMA_BASE_URL
};
