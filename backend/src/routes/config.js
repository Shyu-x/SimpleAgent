const express = require('express');
const router = express.Router();
const { ChannelService, APIAdapter } = require('../services/apiAdapter');

// 存储配置（内存中，实际项目可持久化）
let apiConfig = {
  defaultChannel: 'openai',
  defaultModel: 'gpt-4o',
  apiKeys: {
    openai: '',
    claude: '',
    zhipu: '',
    minimax: ''
  }
};

// 获取所有配置
router.get('/', (_req, res) => {
  res.json({
    channels: ChannelService.getAllChannels(),
    enabledChannels: ChannelService.getEnabledChannels(),
    config: {
      defaultChannel: apiConfig.defaultChannel,
      defaultModel: apiConfig.defaultModel
    }
  });
});

// 获取渠道列表
router.get('/channels', (_req, res) => {
  res.json(ChannelService.getAllChannels());
});

// 获取指定渠道
router.get('/channels/:id', (req, res) => {
  const channel = ChannelService.getChannel(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  res.json(channel);
});

// 更新渠道配置
router.put('/channels/:id', (req, res) => {
  const { name, baseUrl, models, defaultModel, enabled } = req.body;
  const channel = ChannelService.updateChannel(req.params.id, {
    name,
    baseUrl,
    models,
    defaultModel,
    enabled
  });

  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  res.json(channel);
});

// 切换渠道启用状态
router.post('/channels/:id/toggle', (req, res) => {
  const channel = ChannelService.toggleChannel(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  res.json(channel);
});

// API Key管理
router.get('/keys', (_req, res) => {
  // 只返回key是否存在，不返回实际key
  const keyStatus = {};
  for (const [provider, key] of Object.entries(apiConfig.apiKeys)) {
    keyStatus[provider] = key ? 'configured' : 'not_set';
  }
  res.json(keyStatus);
});

// 设置API Key
router.post('/keys', (req, res) => {
  const { provider, apiKey } = req.body;

  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'provider and apiKey are required' });
  }

  if (!apiConfig.apiKeys.hasOwnProperty(provider)) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  apiConfig.apiKeys[provider] = apiKey;
  res.json({ success: true, provider, status: 'configured' });
});

// 获取默认配置
router.get('/defaults', (_req, res) => {
  res.json({
    defaultChannel: apiConfig.defaultChannel,
    defaultModel: apiConfig.defaultModel
  });
});

// 设置默认配置
router.put('/defaults', (req, res) => {
  const { defaultChannel, defaultModel } = req.body;

  if (defaultChannel) {
    const channel = ChannelService.getChannel(defaultChannel);
    if (!channel) {
      return res.status(400).json({ error: 'Invalid channel' });
    }
    apiConfig.defaultChannel = defaultChannel;
  }

  if (defaultModel) {
    apiConfig.defaultModel = defaultModel;
  }

  res.json({
    defaultChannel: apiConfig.defaultChannel,
    defaultModel: apiConfig.defaultModel
  });
});

module.exports = router;
