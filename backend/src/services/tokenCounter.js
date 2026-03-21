/**
 * Token控制系统
 * 实现Token计数、成本估算、限制管理
 */

// 常见模型的Token价格 (每1M tokens)
const MODEL_PRICING = {
  'gpt-4o': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.25, output: 1.25 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'glm-4': { input: 0.05, output: 0.05 },
  'abab6.5s-chat': { input: 0.2, output: 0.2 }
};

// Token估算比率
const TOKEN_RATIOS = {
  // 中文: 1个汉字 ≈ 1.5 tokens
  chinese: 1.5,
  // 英文: 1个字符 ≈ 1.3 tokens
  english: 1.3
};

class TokenCounter {
  constructor(options = {}) {
    this.pricing = { ...MODEL_PRICING, ...options.pricing };
    this.dailyLimit = options.dailyLimit || 1000000; // 每日限制
    this.monthlyLimit = options.monthlyLimit || 10000000; // 每月限制
    this.dailyUsage = new Map(); // 每日使用量
    this.monthlyUsage = new Map(); // 每月使用量
  }

  // 估算Token数量
  estimateTokens(text, language = 'chinese') {
    if (!text) return 0;
    const ratio = language === 'chinese' ? TOKEN_RATIOS.chinese : TOKEN_RATIOS.english;
    return Math.ceil(text.length * ratio);
  }

  // 计算消息Token数
  estimateMessageTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            total += this.estimateTokens(part.text);
          }
        }
      }
      // 消息格式开销
      total += 4;
    }
    // 消息间隔开销
    total += 3;
    return total;
  }

  // 计算成本
  calculateCost(inputTokens, outputTokens, model) {
    const pricing = this.pricing[model] || { input: 1.0, output: 2.0 };
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      inputTokens,
      outputTokens
    };
  }

  // 记录使用量
  recordUsage(sessionId, inputTokens, outputTokens) {
    const today = new Date().toDateString();
    const month = new Date().toISOString().slice(0, 7);

    // 每日使用量
    const dailyKey = `${sessionId}:${today}`;
    const daily = this.dailyUsage.get(dailyKey) || { input: 0, output: 0, requests: 0 };
    daily.input += inputTokens;
    daily.output += outputTokens;
    daily.requests += 1;
    this.dailyUsage.set(dailyKey, daily);

    // 每月使用量
    const monthlyKey = `${sessionId}:${month}`;
    const monthly = this.monthlyUsage.get(monthlyKey) || { input: 0, output: 0, requests: 0 };
    monthly.input += inputTokens;
    monthly.output += outputTokens;
    monthly.requests += 1;
    this.monthlyUsage.set(monthlyKey, monthly);
  }

  // 检查是否超限
  checkLimit(sessionId) {
    const today = new Date().toDateString();
    const month = new Date().toISOString().slice(0, 7);

    const dailyKey = `${sessionId}:${today}`;
    const monthlyKey = `${sessionId}:${month}`;

    const daily = this.dailyUsage.get(dailyKey) || { input: 0, output: 0 };
    const monthly = this.monthlyUsage.get(monthlyKey) || { input: 0, output: 0 };

    const dailyTotal = daily.input + daily.output;
    const monthlyTotal = monthly.input + monthly.output;

    return {
      daily: {
        used: dailyTotal,
        limit: this.dailyLimit,
        remaining: Math.max(0, this.dailyLimit - dailyTotal),
        exceeded: dailyTotal > this.dailyLimit
      },
      monthly: {
        used: monthlyTotal,
        limit: this.monthlyLimit,
        remaining: Math.max(0, this.monthlyLimit - monthlyTotal),
        exceeded: monthlyTotal > this.monthlyLimit
      }
    };
  }

  // 获取统计信息
  getStats(sessionId) {
    return {
      limit: this.checkLimit(sessionId),
      pricing: this.pricing
    };
  }
}

module.exports = { TokenCounter, MODEL_PRICING };
