// 自动生图功能 Hook
// 根据用户意图自动检测并生成图片

import { useCallback, useRef } from 'react';
import api from '../lib/api';
import { detectIntent, IntentType } from './useIntentDetection';

// 图片生成意图关键词
const IMAGE_INTENT_KEYWORDS = [
  '画', '生成图片', '生成图', '看图', '画个', '画一幅', '生成一幅',
  'create image', 'draw', 'generate image', '画出来', '生成一个图'
];

// 检测是否需要生成图片
function shouldGenerateImage(text: string): boolean {
  const lowerText = text.toLowerCase();

  // 快速关键词检测
  for (const keyword of IMAGE_INTENT_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  // 使用意图检测作为备用
  const intentResult = detectIntent(text);
  if (intentResult) {
    // creative 意图且置信度高
    if (intentResult.type === 'creative' && intentResult.confidence >= 0.5) {
      // 检查是否包含生图相关关键词
      return intentResult.matchedKeywords.some(kw =>
        ['画', '生成', '生成图片', '创作'].includes(kw)
      );
    }
  }

  return false;
}

// 从文本中提取图片描述
function extractImagePrompt(text: string): string | null {
  // 移除生图指令相关的关键词，获取核心描述
  const prompt = text
    .replace(/画[一个幅张件]?(?:图|画|图片|图像)/gi, '')
    .replace(/生成[一做个幅张件]?(?:图|图片|图像)/gi, '')
    .replace(/看图/gi, '')
    .replace(/create\s*image/gi, '')
    .replace(/draw/gi, '')
    .replace(/generate\s*image/gi, '')
    .trim();

  // 如果提取后内容太短，可能是纯指令而非描述
  if (prompt.length < 3) {
    return null;
  }

  return prompt;
}

// Hook 返回类型
interface UseAutoImageGenerationReturn {
  // 检查是否需要生成图片
  checkImageIntent: (text: string) => boolean;
  // 生成图片
  generateImage: (
    prompt: string,
    options?: { aspect_ratio?: string }
  ) => Promise<{ url?: string; base64?: string; error?: string }>;
  // 提取图片描述
  extractPrompt: (text: string) => string | null;
}

// 自动生图 Hook
export function useAutoImageGeneration(): UseAutoImageGenerationReturn {
  const isGeneratingRef = useRef(false);

  // 检查是否需要生成图片
  const checkImageIntent = useCallback((text: string): boolean => {
    return shouldGenerateImage(text);
  }, []);

  // 提取图片描述
  const extractPrompt = useCallback((text: string): string | null => {
    return extractImagePrompt(text);
  }, []);

  // 生成图片
  const generateImage = useCallback(async (
    prompt: string,
    options?: { aspect_ratio?: string }
  ): Promise<{ url?: string; base64?: string; error?: string }> => {
    // 防止重复生成
    if (isGeneratingRef.current) {
      return { error: '正在生成中，请稍候' };
    }

    const imagePrompt = extractImagePrompt(prompt);
    if (!imagePrompt) {
      return { error: '无法从文本中提取图片描述' };
    }

    isGeneratingRef.current = true;

    try {
      const { data, error } = await api.image.generate(imagePrompt, {
        aspect_ratio: options?.aspect_ratio || '1:1',
        response_format: 'url'
      });

      if (error || !data) {
        return { error: error || '生成失败' };
      }

      // 返回图片 URL 或 base64
      if (data.url) {
        return { url: data.url };
      } else if (data.base64) {
        return { base64: data.base64 };
      }

      return { error: '未返回有效的图片数据' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : '生成失败' };
    } finally {
      isGeneratingRef.current = false;
    }
  }, []);

  return {
    checkImageIntent,
    generateImage,
    extractPrompt
  };
}

export default useAutoImageGeneration;
