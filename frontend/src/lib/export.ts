// Conversation export utilities
import { Conversation } from '@/types';

export type ExportFormat = 'json' | 'markdown' | 'text' | 'html';

interface ExportData {
  title: string;
  exportedAt: string;
  messageCount: number;
  content: string;
  metadata?: {
    model?: string;
    provider?: string;
  };
}

/**
 * Convert conversation to plain text format
 */
export function toTextFormat(conversation: Conversation): string {
  let text = `# ${conversation.title || '新对话'}\n\n`;
  text += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
  text += `消息数量: ${conversation.messages.length}\n\n`;
  text += '---\n\n';

  for (const msg of conversation.messages) {
    const role = msg.role === 'user' ? '[用户]' : '[AI]';
    text += `## ${role}\n\n`;
    text += `${msg.content}\n\n`;
  }

  return text;
}

/**
 * Convert conversation to Markdown format
 */
export function toMarkdownFormat(conversation: Conversation): string {
  let md = `# ${conversation.title || '新对话'}\n\n`;
  md += `> 导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
  md += `> 消息数量: ${conversation.messages.length}\n\n`;
  md += '---\n\n';

  for (const msg of conversation.messages) {
    const role = msg.role === 'user' ? '**[用户]**' : '**[AI]**';
    md += `### ${role}\n\n`;
    md += `${msg.content}\n\n`;
  }

  return md;
}

/**
 * Convert conversation to HTML format
 */
export function toHtmlFormat(conversation: Conversation): string {
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${conversation.title || 'AI对话导出'}</title>
  <style>
    :root {
      --bg: 210 20% 98%;
      --surface: 0 0% 100%;
      --muted: 210 20% 96%;
      --line: 214 32% 91%;
      --text: 222 47% 11%;
      --text-muted: 215 16% 47%;
      --user: 217 91% 95%;
      --assistant: 210 20% 95%;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: 224 20% 4%;
        --surface: 224 20% 7%;
        --muted: 224 15% 10%;
        --line: 224 15% 16%;
        --text: 210 20% 98%;
        --text-muted: 215 20% 65%;
        --user: 217 40% 22%;
        --assistant: 224 15% 16%;
      }
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: hsl(var(--text));
      background: hsl(var(--bg));
    }
    .header {
      border-bottom: 2px solid hsl(var(--line));
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .meta {
      color: hsl(var(--text-muted));
      font-size: 14px;
    }
    .message {
      margin-bottom: 24px;
      padding: 16px;
      border-radius: 8px;
      background: hsl(var(--surface));
      border: 1px solid hsl(var(--line));
    }
    .message.user {
      background: hsl(var(--user));
    }
    .message.ai {
      background: hsl(var(--assistant));
    }
    .role {
      font-weight: bold;
      margin-bottom: 8px;
      color: hsl(var(--text));
    }
    .content {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .timestamp {
      font-size: 12px;
      color: hsl(var(--text-muted));
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${conversation.title || 'AI对话'}</h1>
    <div class="meta">
      <p>导出时间: ${new Date().toLocaleString('zh-CN')}</p>
      <p>消息数量: ${conversation.messages.length}</p>
    </div>
  </div>
`;

  for (const msg of conversation.messages) {
    const roleClass = msg.role === 'user' ? 'user' : 'ai';
    const roleLabel = msg.role === 'user' ? '[用户]' : '[AI]';
    const timestamp = new Date(msg.createdAt).toLocaleString('zh-CN');

    html += `
  <div class="message ${roleClass}">
    <div class="role">${roleLabel}</div>
    <div class="content">${escapeHtml(msg.content)}</div>
    <div class="timestamp">${timestamp}</div>
  </div>
`;
  }

  html += `
</body>
</html>`;

  return html;
}

/**
 * Convert conversation to JSON format
 */
export function toJsonFormat(conversation: Conversation): string {
  const data = {
    title: conversation.title,
    exportedAt: new Date().toISOString(),
    createdAt: new Date(conversation.createdAt).toISOString(),
    updatedAt: new Date(conversation.updatedAt).toISOString(),
    messageCount: conversation.messages.length,
    messages: conversation.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      createdAt: new Date(msg.createdAt).toISOString(),
    })),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Export conversation to specified format
 */
export function exportConversation(
  conversation: Conversation,
  format: ExportFormat
): ExportData {
  const formats: Record<ExportFormat, () => string> = {
    json: () => toJsonFormat(conversation),
    markdown: () => toMarkdownFormat(conversation),
    text: () => toTextFormat(conversation),
    html: () => toHtmlFormat(conversation),
  };

  const content = formats[format]();

  return {
    title: conversation.title || '新对话',
    exportedAt: new Date().toISOString(),
    messageCount: conversation.messages.length,
    content,
  };
}

/**
 * Download exported content as file
 */
export function downloadExport(data: ExportData, format: ExportFormat): void {
  const mimeTypes: Record<ExportFormat, string> = {
    json: 'application/json',
    markdown: 'text/markdown',
    text: 'text/plain',
    html: 'text/html',
  };

  const extensions: Record<ExportFormat, string> = {
    json: 'json',
    markdown: 'md',
    text: 'txt',
    html: 'html',
  };

  const blob = new Blob([data.content], { type: mimeTypes[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.title}_${new Date().toISOString().slice(0, 10)}.${extensions[format]}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Copy selected text to clipboard
 */
export async function copySelectedText(): Promise<boolean> {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim();

  if (!selectedText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(selectedText);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get word count from text
 */
export function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Get character count from text
 */
export function getCharCount(text: string): number {
  return text.length;
}
