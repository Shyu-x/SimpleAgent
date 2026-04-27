/**
 * MiniMax API 服务
 * 提供图像生成、语音合成等 MiniMax API 调用
 */

const MINIMAX_API_HOST = process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';

class MiniMaxService {
  /**
   * 图像生成
   * @param {string} prompt - 提示词
   * @param {string} aspectRatio - 宽高比
   * @param {string} apiKey - API密钥
   * @returns {Promise<object>}
   */
  async generateImage(prompt, aspectRatio = '1:1', apiKey) {
    const key = apiKey || process.env.MINIMAX_API_KEY;
    if (!key) {
      throw new Error('MiniMax API Key 未配置');
    }

    const validRatios = ['1:1', '16:9', '9:16', '3:4', '4:3'];
    if (!validRatios.includes(aspectRatio)) {
      throw new Error(`aspect_ratio 必须为 ${validRatios.join('|')} 之一`);
    }

    const response = await fetch(`${MINIMAX_API_HOST}/v1/image_generation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'image-01', prompt, aspect_ratio: aspectRatio, response_format: 'url' })
    });

    const data = await response.json();

    if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
      throw new Error(data.base_resp.status_msg || '图片生成失败');
    }

    if (!response.ok) {
      throw new Error(data.error?.message || '请求失败');
    }

    const imageUrl = data.data?.image_urls?.[0] || data.data?.[0]?.url || data.url || data.base64;
    if (!imageUrl) {
      throw new Error('图片生成结果无效，未返回图片URL');
    }

    return { success: true, image_url: imageUrl, revised_prompt: data.revised_prompt, created_at: data.created_at };
  }

  /**
   * 语音合成
   * @param {string} text - 文本
   * @param {string} voiceId - 语音ID
   * @param {string} apiKey - API密钥
   * @returns {Promise<object>}
   */
  async synthesizeSpeech(text, voiceId = 'male-qn-qingse', apiKey) {
    const key = apiKey || process.env.MINIMAX_API_KEY;
    if (!key) {
      throw new Error('MiniMax API Key 未配置');
    }

    const response = await fetch(`${MINIMAX_API_HOST}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text,
        voice_settings: { voice_id: voiceId, speed: 1.0, volume: 1.0, pitch: 0 },
        output_format: 'mp3'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: '请求失败' } }));
      throw new Error(error.error?.message || '请求失败');
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const audioUrl = `data:audio/mp3;base64,${base64}`;

    return { success: true, audio_url: audioUrl, format: 'mp3' };
  }
}

module.exports = new MiniMaxService();
