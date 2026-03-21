/**
 * 图片生成工具
 * 使用 MiniMax image-01 API 生成图片
 */

class ImageGenerationTool {
  constructor(options = {}) {
    this.name = 'image_generation';
    this.description = '图片生成 - 使用AI生成图片，支持中文描述';
    this.category = 'multimodal';
    this.timeout = options.timeout || 60000;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '图片生成描述，支持中文'
        },
        options: {
          type: 'object',
          properties: {
            size: {
              type: 'string',
              enum: ['1024x1024', '1536x1024', '1024x1536'],
              default: '1024x1024'
            },
            quality: {
              type: 'string',
              enum: ['standard', 'high'],
              default: 'standard'
            }
          }
        }
      },
      required: ['prompt']
    };
  }

  async execute(params) {
    const { prompt, options = {} } = params;

    if (!prompt || prompt.trim().length === 0) {
      return { success: false, error: '图片描述不能为空' };
    }

    try {
      const response = await fetch('https://api.minimaxi.com/v1/image_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MINIMAX_API_KEY || ''}`
        },
        body: JSON.stringify({
          model: 'image-01',
          prompt: prompt,
          size: options.size || '1024x1024',
          quality: options.quality || 'standard',
          num: 1
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Image API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        imageUrl: data.data?.[0]?.url || data.url,
        revisedPrompt: data.data?.[0]?.revised_prompt,
        model: 'image-01'
      };
    } catch (error) {
      return {
        success: false,
        error: `图片生成失败: ${error.message}`
      };
    }
  }
}

module.exports = ImageGenerationTool;
