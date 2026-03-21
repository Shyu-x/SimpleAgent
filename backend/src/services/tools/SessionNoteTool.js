/**
 * Session Note Tool - 持久化会话记忆
 * 借鉴 MiniMax Mini-Agent 的 Session Note 设计
 */

const fs = require('fs');
const path = require('path');

/**
 * SessionNoteTool - 让Agent记录和回忆重要信息
 *
 * 功能：
 * - recordNote: 记录重要信息
 * - recallNotes: 回忆记录的笔记
 */
class SessionNoteTool {
  constructor(options = {}) {
    this.memoryFile = options.memoryFile || './workspace/.agent_memory.json';
    this.memoryDir = path.dirname(this.memoryFile);
  }

  /**
   * 获取工具定义 (Anthropic格式)
   */
  getDefinition() {
    return {
      name: 'record_note',
      description: 'Record important information as session notes for future reference. Use this to record key facts, user preferences, decisions, or context that should be recalled later in the agent execution chain. Each note is timestamped.',
      input_schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The information to record as a note. Be concise but specific.'
          },
          category: {
            type: 'string',
            description: 'Optional category/tag for this note (e.g., "user_preference", "project_info", "decision")',
            default: 'general'
          }
        },
        required: ['content']
      }
    };
  }

  /**
   * 获取Recall工具定义
   */
  getRecallDefinition() {
    return {
      name: 'recall_notes',
      description: 'Recall all previously recorded session notes. Use this to retrieve important information, context, or decisions from earlier in the session or previous agent execution chains.',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional: filter notes by category'
          }
        }
      }
    };
  }

  /**
   * 记录笔记
   */
  async recordNote(content, category = 'general') {
    try {
      // 确保目录存在
      if (!fs.existsSync(this.memoryDir)) {
        fs.mkdirSync(this.memoryDir, { recursive: true });
      }

      // 加载现有笔记
      let notes = [];
      if (fs.existsSync(this.memoryFile)) {
        try {
          const data = fs.readFileSync(this.memoryFile, 'utf8');
          notes = JSON.parse(data);
        } catch (e) {
          notes = [];
        }
      }

      // 添加新笔记
      const note = {
        timestamp: new Date().toISOString(),
        category,
        content
      };
      notes.push(note);

      // 保存
      fs.writeFileSync(this.memoryFile, JSON.stringify(notes, null, 2), 'utf8');

      return {
        success: true,
        content: `Recorded note: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''} (category: ${category})`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to record note: ${error.message}`
      };
    }
  }

  /**
   * 回忆笔记
   */
  async recallNotes(category = null) {
    try {
      if (!fs.existsSync(this.memoryFile)) {
        return {
          success: true,
          content: 'No notes recorded yet.'
        };
      }

      const data = fs.readFileSync(this.memoryFile, 'utf8');
      let notes = JSON.parse(data);

      if (!notes || notes.length === 0) {
        return {
          success: true,
          content: 'No notes recorded yet.'
        };
      }

      // 按类别过滤
      if (category) {
        notes = notes.filter(n => n.category === category);
        if (notes.length === 0) {
          return {
            success: true,
            content: `No notes found in category: ${category}`
          };
        }
      }

      // 格式化输出
      const formatted = notes.map((note, idx) => {
        const ts = new Date(note.timestamp).toLocaleString();
        return `${idx + 1}. [${note.category}] ${note.content}\n   (${ts})`;
      }).join('\n\n');

      return {
        success: true,
        content: `Recorded Notes (${notes.length}):\n\n${formatted}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to recall notes: ${error.message}`
      };
    }
  }

  /**
   * 清除所有笔记
   */
  async clearNotes() {
    try {
      if (fs.existsSync(this.memoryFile)) {
        fs.unlinkSync(this.memoryFile);
      }
      return {
        success: true,
        content: 'All notes cleared.'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to clear notes: ${error.message}`
      };
    }
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    try {
      if (!fs.existsSync(this.memoryFile)) {
        return {
          success: true,
          content: 'Memory file: not exists\nTotal notes: 0'
        };
      }

      const data = fs.readFileSync(this.memoryFile, 'utf8');
      const notes = JSON.parse(data);

      // 按类别统计
      const categoryCount = {};
      for (const note of notes) {
        categoryCount[note.category] = (categoryCount[note.category] || 0) + 1;
      }

      const lines = [
        `Memory file: ${this.memoryFile}`,
        `Total notes: ${notes.length}`,
        `Categories:`
      ];

      for (const [cat, count] of Object.entries(categoryCount)) {
        lines.push(`  - ${cat}: ${count}`);
      }

      return {
        success: true,
        content: lines.join('\n')
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get stats: ${error.message}`
      };
    }
  }

  /**
   * 执行工具
   */
  async execute(toolName, args = {}) {
    switch (toolName) {
      case 'record_note':
        return this.recordNote(args.content, args.category);
      case 'recall_notes':
        return this.recallNotes(args.category);
      case 'clear_notes':
        return this.clearNotes();
      case 'memory_stats':
        return this.getStats();
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`
        };
    }
  }
}

module.exports = SessionNoteTool;
