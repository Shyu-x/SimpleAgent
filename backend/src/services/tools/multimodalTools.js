/**
 * 多模态工具集
 * 包含图像分析、语音转文字、文字转语音工具
 */

class ImageAnalyzeTool {
  constructor(options = {}) {
    this.name = 'image_analyze';
    this.description = '分析图片内容，识别物体、场景、文字等';
    this.category = 'multimodal';
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 2;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: '图片URL或base64编码'
        },
        prompt: {
          type: 'string',
          description: '分析提示词'
        },
        detail: {
          type: 'string',
          enum: ['low', 'high', 'auto'],
          default: 'auto',
          description: '分析详细程度'
        }
      },
      required: ['image']
    };
  }

  async execute(args) {
    const { image, prompt = '请详细描述这张图片的内容', detail = 'auto' } = args;

    // 支持URL或base64
    let imageData;
    if (image.startsWith('data:')) {
      // base64格式，直接提取数据部分
      const base64Data = image.split(',')[1];
      imageData = {
        type: 'base64',
        media_type: this.detectMimeType(image),
        data: base64Data
      };
    } else if (image.startsWith('http')) {
      // URL格式
      imageData = {
        type: 'url',
        url: image
      };
    } else {
      // 纯base64
      imageData = {
        type: 'base64',
        media_type: 'image/jpeg',
        data: image
      };
    }

    // 调用多模态LLM
    const result = await this.callMultimodalModel({
      image: imageData,
      prompt,
      detail
    });

    return {
      success: true,
      description: result.description,
      objects: result.objects || [],
      text: result.text || '',
      confidence: result.confidence || 0
    };
  }

  detectMimeType(base64String) {
    if (base64String.startsWith('/9j/')) return 'image/jpeg';
    if (base64String.startsWith('iVBOR')) return 'image/png';
    if (base64String.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg';
  }

  async callMultimodalModel(params) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    const model = process.env.VISION_MODEL || 'claude-3-sonnet-20240229';

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY not configured');
    }

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: params.image
          },
          {
            type: 'text',
            text: params.prompt
          }
        ]
      }
    ];

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1024
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Vision API error: ${error}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';

      // 简单解析结果
      return {
        description: text,
        objects: this.extractObjects(text),
        text: this.extractText(text),
        confidence: 0.85
      };
    } catch (error) {
      // 如果Claude失败，尝试OpenAI
      return this.callOpenAIVision(params);
    }
  }

  async callOpenAIVision(params) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: params.prompt },
          {
            type: 'image_url',
            image_url: params.image.type === 'url' ? { url: params.image.url } : { url: `data:${params.image.media_type};base64,${params.image.data}` }
          }
        ]
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Vision API error: ${error}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    return {
      description: text,
      objects: this.extractObjects(text),
      text: this.extractText(text),
      confidence: 0.85
    };
  }

  extractObjects(text) {
    // 简单的物体提取
    const objectPatterns = [
      /(?:看到|识别出|检测到|包含|有)(.+?)(?:，|,|$)/g,
      /(.+?)在/g
    ];
    const objects = [];
    // 简化实现
    return objects;
  }

  extractText(text) {
    // 检查是否包含文字
    const hasText = /文字|文本|字|文/.test(text);
    return hasText ? '图片中包含文字' : '';
  }
}

class SpeechToTextTool {
  constructor(options = {}) {
    this.name = 'speech_to_text';
    this.description = '将语音转换为文字，支持多种语言';
    this.category = 'multimodal';
    this.timeout = options.timeout || 60000;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          description: '音频URL或base64编码'
        },
        language: {
          type: 'string',
          description: '语言代码，如 zh, en, ja'
        },
        prompt: {
          type: 'string',
          description: '提示词，帮助识别专业术语等'
        }
      },
      required: ['audio']
    };
  }

  async execute(args) {
    const { audio, language = 'zh', prompt = '' } = args;

    // 准备音频数据
    let audioData;
    if (audio.startsWith('data:')) {
      const base64Data = audio.split(',')[1];
      audioData = base64Data;
    } else if (audio.startsWith('http')) {
      // 需要下载音频
      audioData = await this.downloadAudio(audio);
    } else {
      audioData = audio;
    }

    // 调用 Whisper API
    const result = await this.callWhisperAPI(audioData, language, prompt);

    return {
      success: true,
      text: result.text,
      language: result.language || language,
      duration: result.duration,
      confidence: result.confidence || 0.9
    };
  }

  async downloadAudio(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  async callWhisperAPI(audioData, language, prompt) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured for Whisper');
    }

    // 转换base64为ArrayBuffer
    const binaryString = atob(audioData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const formData = new FormData();
    const blob = new Blob([bytes], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', language);
    if (prompt) {
      formData.append('prompt', prompt);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Whisper API error: ${error}`);
    }

    const data = await response.json();

    return {
      text: data.text,
      language
    };
  }
}

class TextToSpeechTool {
  constructor(options = {}) {
    this.name = 'text_to_speech';
    this.description = '将文字转换为语音，支持多种声音和语言';
    this.category = 'multimodal';
    this.timeout = options.timeout || 30000;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '要转换的文字'
        },
        voice: {
          type: 'string',
          description: '声音名称',
          enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'zh-CN-Yunxi', 'zh-CN-Yunyang']
        },
        model: {
          type: 'string',
          enum: ['tts-1', 'tts-1-hd'],
          default: 'tts-1'
        },
        speed: {
          type: 'number',
          minimum: 0.25,
          maximum: 4,
          default: 1
        }
      },
      required: ['text']
    };
  }

  async execute(args) {
    const { text, voice = 'onyx', model = 'tts-1', speed = 1 } = args;

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured for TTS');
    }

    // 限制文本长度
    const maxLength = 4096;
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        voice,
        input: truncatedText,
        speed
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TTS API error: ${error}`);
    }

    // 获取音频数据并转换为base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    return {
      success: true,
      audio: `data:audio/mp3;base64,${base64Audio}`,
      format: 'mp3',
      duration: this.estimateDuration(truncatedText, speed)
    };
  }

  estimateDuration(text, speed) {
    // 粗略估算：中文约每分钟400字，英文约每分钟150词
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const chineseDuration = chineseChars / (400 / 60) / speed;
    const englishDuration = englishWords / (150 / 60) / speed;
    return Math.round(chineseDuration + englishDuration);
  }
}

module.exports = {
  ImageAnalyzeTool,
  SpeechToTextTool,
  TextToSpeechTool
};