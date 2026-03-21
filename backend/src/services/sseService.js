const { mockResponses } = require('../data/mockData');

// SSE流式输出服务
class SSEService {
  // 将文本转换为流式数据
  static async *streamText(text, delay = 30) {
    for (let i = 0; i < text.length; i++) {
      yield text[i];
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 处理聊天请求 - 模拟流式响应
  static async handleChat(req, res) {
    const { messages, model = 'gpt-4o', stream = true } = req.body;

    // 设置SSE响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // 发送连接成功消息
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // 根据最后一条用户消息选择模拟回复
    const lastMessage = messages[messages.length - 1]?.content || '';
    let responseText = '';

    // 简单关键词匹配选择回复
    if (lastMessage.includes('你好') || lastMessage.includes('hello') || lastMessage.includes('hi')) {
      responseText = mockResponses.greeting.join('');
    } else if (lastMessage.includes('代码') || lastMessage.includes('code') || lastMessage.includes('编程')) {
      responseText = mockResponses.code;
    } else if (lastMessage.includes('解释') || lastMessage.includes('介绍') || lastMessage.includes('说明')) {
      responseText = mockResponses.explanation;
    } else {
      responseText = mockResponses.long;
    }

    // 流式发送每个字符
    for (let i = 0; i < responseText.length; i++) {
      // 检查客户端是否断开连接
      if (res.writableEnded) break;

      const chunk = responseText[i];
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // 发送完成消息
    res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
    res.end();
  }

  // 停止生成（清理资源）
  static handleStop(req, res) {
    res.json({ success: true, message: '生成已停止' });
  }
}

module.exports = SSEService;
