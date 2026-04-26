/**
 * MiniMax 思维链解析服务
 * 解析thinking标签，提取思维过程并支持可视化
 */

class ThinkingChainParser {
  constructor() {
    // 思维链正则表达式
    this.THINK_PATTERN = /<think>([\s\S]*?)\[\/THINK\]/g;
    this.THINK_SINGLE_PATTERN = /<think>([\s\S]*?)\[\/THINK\]/;
  }

  /**
   * 解析完整响应，提取思维链和实际内容
   * @param {string} rawResponse - 原始响应（包含[THINK]标签）
   * @returns {Object} { thinking: string[], content: string, hasThinking: boolean }
   */
  parse(rawResponse) {
    const thinking = [];
    const thinkingMatches = rawResponse.match(this.THINK_PATTERN);

    if (thinkingMatches) {
      for (const match of thinkingMatches) {
        const content = match.replace(/<think>/, '').replace(/\[\/THINK\]/, '');
        thinking.push(this.cleanThinkingContent(content));
      }
    }

    // 移除所有思维链标签，获取纯净内容
    const content = rawResponse
      .replace(this.THINK_PATTERN, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      thinking,
      content,
      hasThinking: thinking.length > 0,
      thinkingTokenCount: thinking.join('').length
    };
  }

  /**
   * 清理思维内容（移除重复的思考片段）
   */
  cleanThinkingContent(content) {
    return content
      .split('\n')
      .filter(line => line.trim())
      .join('\n');
  }

  /**
   * 提取思维链步骤
   */
  extractThinkingSteps(rawResponse) {
    const result = this.parse(rawResponse);
    if (!result.hasThinking) return [];

    // 将思维链按行分解成逻辑步骤
    const steps = [];
    let currentStep = { type: 'thinking', lines: [] };

    for (const line of result.thinking.join('\n').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 检测是否是新的推理步骤
      if (this.isNewStep(trimmed)) {
        if (currentStep.lines.length > 0) {
          steps.push(currentStep);
        }
        currentStep = { type: 'thinking', lines: [trimmed] };
      } else {
        currentStep.lines.push(trimmed);
      }
    }

    if (currentStep.lines.length > 0) {
      steps.push(currentStep);
    }

    // 添加最终回答步骤
    if (result.content) {
      steps.push({ type: 'response', lines: [result.content] });
    }

    return steps;
  }

  /**
   * 检测是否是新的推理步骤
   */
  isNewStep(line) {
    const patterns = [
      /^\d+[.)]/,           // 1. 2. 或 1) 2)
      /^[a-z][.)]/i,         // a. b. 或 a) b)
      /^首先[，,]/,          // 首先
      /^然后[，,]/,          // 然后
      /^接着[，,]/,          // 接着
      /^最后[，,]/,          // 最后
      /^因此[，,]/,          // 因此
      /^所以[，,]/,          // 所以
      /^但是[，,]/,          // 但是
      /^然而[，,]/,          // 然而
      /^不过[，,]/,          // 不过
      /^虽然[，,]/,          // 虽然
    ];

    return patterns.some(p => p.test(line));
  }

  /**
   * 生成思维链可视化数据
   */
  generateVisualization(rawResponse) {
    const steps = this.extractThinkingSteps(rawResponse);

    return {
      totalSteps: steps.length,
      thinkingSteps: steps.filter(s => s.type === 'thinking').length,
      hasThinking: steps.some(s => s.type === 'thinking'),
      timeline: steps.map((step, index) => ({
        step: index + 1,
        type: step.type,
        label: step.type === 'thinking' ? `推理 ${index + 1}` : '最终回答',
        content: step.lines.join(' ').substring(0, 200),
        expanded: false
      }))
    };
  }

  /**
   * 生成 Markdown 格式的思维链
   */
  toMarkdown(rawResponse) {
    const result = this.parse(rawResponse);
    if (!result.hasThinking) {
      return `## 回答\n\n${result.content}`;
    }

    let md = '## 思维过程\n\n';

    result.thinking.forEach((thought, index) => {
      md += `### 步骤 ${index + 1}\n\n${thought}\n\n`;
    });

    md += '---\n\n## 最终回答\n\n' + result.content;

    return md;
  }

  /**
   * 生成纯文本格式（无思维链）
   */
  toPlainText(rawResponse) {
    const result = this.parse(rawResponse);
    return result.content;
  }
}

// 导出单例
const thinkingChainParser = new ThinkingChainParser();

module.exports = { ThinkingChainParser, thinkingChainParser };
