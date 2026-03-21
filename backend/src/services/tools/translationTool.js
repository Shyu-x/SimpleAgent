/**
 * 翻译工具
 * 支持多种语言之间的翻译
 */

class TranslationTool {
  constructor(options = {}) {
    this.name = 'translation';
    this.description = '翻译工具 - 支持多种语言互译';
    this.category = 'utility';
    this.timeout = options.timeout || 30000;
    this.supportedLanguages = [
      'zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar', 'pt',
      'it', 'nl', 'pl', 'tr', 'vi', 'th', 'hi', 'id', 'ms'
    ];
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '要翻译的文本'
        },
        from: {
          type: 'string',
          description: '源语言 (如: zh, en, auto)',
          default: 'auto'
        },
        to: {
          type: 'string',
          description: '目标语言 (如: en, zh, ja)'
        }
      },
      required: ['text', 'to']
    };
  }

  async execute(params) {
    const { text, from = 'auto', to } = params;

    if (!text || text.trim().length === 0) {
      return { success: false, error: '翻译文本不能为空' };
    }

    if (!this.supportedLanguages.includes(to.toLowerCase())) {
      return {
        success: false,
        error: `不支持的目标语言: ${to}，支持的语言: ${this.supportedLanguages.join(', ')}`
      };
    }

    try {
      // 使用 LibreTranslate API (免费开源)
      const response = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: text,
          source: from === 'auto' ? 'auto' : from,
          target: to,
          format: 'text'
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Translation API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        translation: data.translatedText,
        detectedLanguage: data.detectedLanguage?.language || from,
        from: from === 'auto' ? (data.detectedLanguage?.language || 'auto') : from,
        to
      };
    } catch (error) {
      // 备选：使用 MyMemory API
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) throw new Error('MyMemory API error');

        const data = await response.json();

        return {
          success: true,
          translation: data.responseData.translatedText,
          from: from === 'auto' ? data.responseData.detectedLanguage : from,
          to,
          source: 'MyMemory'
        };
      } catch (fallbackError) {
        return {
          success: false,
          error: `翻译失败: ${error.message}`
        };
      }
    }
  }
}

module.exports = TranslationTool;
