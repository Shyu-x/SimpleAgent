/**
 * 图片生成意图检测 Hook
 * 检测用户输入是否包含图片生成意图
 */

// 意图关键词检测规则（中文）
const IMAGE_INTENT_PATTERNS = [
  /画[一张个幅部]/,           // 画一张、画个、画幅、画部
  /生成图片/,                 // 生成图片
  /生成图/,                   // 生成图
  /帮我画/,                   // 帮我画
  /生成一张/,                 // 生成一张
  /画个/,                     // 画个
  /生成一幅/,                 // 生成一幅
  /看着像.*图/,               // 看着像...图
  /变成图/,                   // 变成图
  /做张图/,                   // 做张图
  /搞张图/,                   // 搞张图
  /生成.*图像/,               // 生成...图像
  /生成.*图片/,               // 生成...图片
  /给我画/,                   // 给我画
  /画.*图/,                   // 画...图
  /创作.*图/,                 // 创作...图
  /设计.*图/,                 // 设计...图
];

export interface ImageIntentResult {
  isImageRequest: boolean;
  prompt: string;
  confidence: number;
}

/**
 * 检测文本中的图片生成意图
 * @param text 用户输入文本
 * @returns 检测结果
 */
export function detectImageIntent(text: string): ImageIntentResult {
  const matchedPatterns = IMAGE_INTENT_PATTERNS.filter(p => p.test(text));
  const isImageRequest = matchedPatterns.length > 0;
  const confidence = Math.min(matchedPatterns.length * 0.3, 1.0);

  return {
    isImageRequest,
    prompt: text,
    confidence,
  };
}

/**
 * 清理用于图片生成的提示词
 * 移除可能干扰图片生成的指令性文字
 */
export function cleanImagePrompt(text: string): string {
  let prompt = text;

  // 移除常见的指令前缀
  const prefixesToRemove = [
    /^(帮我)?画/,
    /^(帮我)?生成/,
    /^(请你?|请帮我)?画/,
    /^(请你?|请帮我)?生成/,
    /给我画/,
    /帮我生成/,
  ];

  for (const prefix of prefixesToRemove) {
    prompt = prompt.replace(prefix, '');
  }

  return prompt.trim();
}

export default detectImageIntent;
