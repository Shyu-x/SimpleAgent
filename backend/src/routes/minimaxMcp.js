/**
 * MiniMax MCP 路由
 * 提供 MiniMax 图像生成、语音合成、MCP Server 连接功能
 */

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { mcpManager } = require('../mcp');

// MiniMax API 配置
const MINIMAX_API_HOST = process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';

// MCP Server 连接状态
let mcpConnection = {
  connected: false,
  serverName: null,
  tools: [],
  error: null
};

/**
 * POST /api/minimax/image
 * MiniMax 图像生成
 */
router.post('/image', async (req, res) => {
  const { prompt, aspect_ratio = '1:1', apiKey } = req.body;

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: { message: 'prompt 参数必填' }
    });
  }

  // 支持自定义 API Key 或使用环境变量
  const key = apiKey || process.env.MINIMAX_API_KEY;
  if (!key) {
    return res.status(400).json({
      success: false,
      error: { message: 'MiniMax API Key 未配置' }
    });
  }

  // 验证 aspect_ratio
  const validRatios = ['1:1', '16:9', '9:16', '3:4', '4:3'];
  if (!validRatios.includes(aspect_ratio)) {
    return res.status(400).json({
      success: false,
      error: { message: `aspect_ratio 必须为 ${validRatios.join('|')} 之一` }
    });
  }

  try {
    const response = await fetch(`${MINIMAX_API_HOST}/v1/image_generation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'image-01',
        prompt,
        aspect_ratio,
        response_format: 'url'
      })
    });

    const data = await response.json();

    // 检查 MiniMax API 返回的错误（例如 usage limit exceeded）
    if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: data.base_resp.status_msg || '图片生成失败',
          code: data.base_resp.status_code
        }
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data.error || { message: '请求失败' }
      });
    }

    // 返回标准化格式 - MiniMax 返回 data.image_urls (复数)
    const imageUrl = data.data?.image_urls?.[0] || data.data?.[0]?.url || data.url || data.base64;

    if (!imageUrl) {
      return res.status(500).json({
        success: false,
        error: { message: '图片生成结果无效，未返回图片URL' }
      });
    }

    res.json({
      success: true,
      image_url: imageUrl,
      revised_prompt: data.revised_prompt,
      created_at: data.created_at
    });
  } catch (error) {
    console.error('[MiniMax MCP] 图像生成失败:', error);
    res.status(500).json({
      success: false,
      error: { message: `图像生成失败: ${error.message}` }
    });
  }
});

/**
 * POST /api/minimax/tts
 * MiniMax 语音合成 (Text-to-Speech)
 */
router.post('/tts', async (req, res) => {
  const { text, voice_id = 'male-qn-qingse', apiKey } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: { message: 'text 参数必填' }
    });
  }

  const key = apiKey || process.env.MINIMAX_API_KEY;
  if (!key) {
    return res.status(400).json({
      success: false,
      error: { message: 'MiniMax API Key 未配置' }
    });
  }

  try {
    const response = await fetch(`${MINIMAX_API_HOST}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text,
        voice_settings: {
          voice_id,
          speed: 1.0,
          volume: 1.0,
          pitch: 0
        },
        output_format: 'mp3'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: '请求失败' } }));
      return res.status(response.status).json({
        success: false,
        error
      });
    }

    // TTS 返回的是二进制音频数据
    const buffer = await response.arrayBuffer();

    // 转换为 base64
    const base64 = Buffer.from(buffer).toString('base64');
    const audioUrl = `data:audio/mp3;base64,${base64}`;

    res.json({
      success: true,
      audio_url: audioUrl,
      format: 'mp3'
    });
  } catch (error) {
    console.error('[MiniMax MCP] 语音合成失败:', error);
    res.status(500).json({
      success: false,
      error: { message: `语音合成失败: ${error.message}` }
    });
  }
});

/**
 * POST /api/minimax/connect
 * 连接 MiniMax MCP Server
 */
router.post('/connect', async (req, res) => {
  // 如果已连接，先断开
  if (mcpConnection.connected && mcpConnection.serverName) {
    try {
      await mcpManager.disconnectFromServer(mcpConnection.serverName);
    } catch (e) {
      // 忽略断开错误
    }
  }

  const { apiKey, apiHost } = req.body;
  const key = apiKey || process.env.MINIMAX_API_KEY;
  const host = apiHost || process.env.MINIMAX_API_HOST || MINIMAX_API_HOST;

  if (!key) {
    return res.status(400).json({
      success: false,
      error: { message: 'MiniMax API Key 未配置' }
    });
  }

  const serverName = 'minimax';
  const serverCommand = 'npx';
  const serverArgs = ['-y', 'minimax-mcp-js'];

  // 设置环境变量
  const env = {
    ...process.env,
    MINIMAX_API_KEY: key,
    MINIMAX_API_HOST: host
  };

  try {
    console.log(`[MiniMax MCP] 正在连接 MCP Server: ${serverCommand} ${serverArgs.join(' ')}`);

    // 使用 mcpManager 连接服务器
    await mcpManager.connectToServer(serverName, serverCommand, serverArgs);

    // 获取已注册的工具列表
    const tools = [];
    for (const [name, tool] of mcpManager.tools) {
      if (tool.serverName === serverName) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        });
      }
    }

    mcpConnection = {
      connected: true,
      serverName,
      tools,
      error: null
    };

    console.log(`[MiniMax MCP] 连接成功，已注册 ${tools.length} 个工具`);

    res.json({
      success: true,
      message: 'MiniMax MCP Server 连接成功',
      server_name: serverName,
      tools_count: tools.length,
      tools: tools.map(t => t.name)
    });
  } catch (error) {
    console.error('[MiniMax MCP] 连接失败:', error);

    mcpConnection = {
      connected: false,
      serverName: null,
      tools: [],
      error: error.message
    };

    res.status(500).json({
      success: false,
      error: { message: `MCP Server 连接失败: ${error.message}` }
    });
  }
});

/**
 * GET /api/minimax/status
 * 获取 MCP 连接状态
 */
router.get('/status', (req, res) => {
  const registeredTools = [];

  // 获取 MiniMax 相关的工具
  for (const [name, tool] of mcpManager.tools) {
    if (tool.serverName === 'minimax' || tool.category === 'minimax') {
      registeredTools.push({
        name: tool.name,
        description: tool.description
      });
    }
  }

  res.json({
    success: true,
    mcp_server: {
      connected: mcpConnection.connected,
      server_name: mcpConnection.serverName,
      tools_count: registeredTools.length,
      error: mcpConnection.error
    },
    registered_tools: registeredTools,
    api_config: {
      api_host: process.env.MINIMAX_API_HOST || MINIMAX_API_HOST,
      has_api_key: !!process.env.MINIMAX_API_KEY
    }
  });
});

/**
 * POST /api/minimax/disconnect
 * 断开 MiniMax MCP Server 连接
 */
router.post('/disconnect', async (req, res) => {
  if (!mcpConnection.connected || !mcpConnection.serverName) {
    return res.json({
      success: true,
      message: '未连接到 MiniMax MCP Server'
    });
  }

  try {
    await mcpManager.disconnectFromServer(mcpConnection.serverName);

    mcpConnection = {
      connected: false,
      serverName: null,
      tools: [],
      error: null
    };

    res.json({
      success: true,
      message: '已断开 MiniMax MCP Server 连接'
    });
  } catch (error) {
    console.error('[MiniMax MCP] 断开连接失败:', error);
    res.status(500).json({
      success: false,
      error: { message: `断开连接失败: ${error.message}` }
    });
  }
});

module.exports = router;
